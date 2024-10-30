"use server";
import db from "@/db/db";
import { z } from "zod";
import fs from "fs/promises";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Define a custom schema to check that a file is present
const fileSchema = z
  .custom((file) => file instanceof Buffer && file.length > 0, { message: "Required" });

const addSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priceInCents: z.coerce.number().int().min(1),
  file: fileSchema,
  image: fileSchema, // Assuming both `file` and `image` will be handled as Buffers
});

export async function addProduct(prevState: unknown, formData: FormData) {
  const file = formData.get("file") as Blob;
  const image = formData.get("image") as Blob;

  const result = addSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceInCents: formData.get("priceInCents"),
    file: Buffer.from(await file.arrayBuffer()),
    image: Buffer.from(await image.arrayBuffer()),
  });

  if (result.success === false) {
    return result.error.formErrors.fieldErrors;
  }

  const data = result.data;

  await fs.mkdir("products", { recursive: true });
  const filePath = `products/${crypto.randomUUID()}-${file.name}`;
  await fs.writeFile(filePath, data.file);

  await fs.mkdir("public/products", { recursive: true });
  const imagePath = `/products/${crypto.randomUUID()}-${image.name}`;
  await fs.writeFile(`public${imagePath}`, data.image);

  await db.product.create({
    data: {
      isAvailableForPurchase: false,
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  });
  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}

export async function toggleProductAvailability(
  id: string,
  isAvailableForPurchase: boolean
) {
  await db.product.update({ where: { id }, data: { isAvailableForPurchase } });
  revalidatePath("/");
  revalidatePath("/products");
}

export async function deleteProduct(id: string) {
  const product = await db.product.delete({ where: { id } });
  if (product == null) return notFound();
  await fs.unlink(product.filePath);
  await fs.unlink(`public${product.imagePath}`);
  revalidatePath("/");
  revalidatePath("/products");
}

const updateSchema = addSchema.extend({
  file: fileSchema.optional(),
  image: fileSchema.optional(),
});

export async function updateProduct(
  id: string,
  prevState: unknown,
  formData: FormData
) {
  const file = formData.get("file") as Blob;
  const image = formData.get("image") as Blob;

  const result = updateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceInCents: formData.get("priceInCents"),
    file: file ? Buffer.from(await file.arrayBuffer()) : undefined,
    image: image ? Buffer.from(await image.arrayBuffer()) : undefined,
  });

  if (result.success === false) {
    return result.error.formErrors.fieldErrors;
  }

  const data = result.data;
  const product = await db.product.findUnique({ where: { id } });
  if (product == null) return notFound();

  let filePath = product.filePath;
  if (data.file) {
    await fs.unlink(product.filePath);
    filePath = `products/${crypto.randomUUID()}-${file.name}`;
    await fs.writeFile(filePath, data.file);
  }

  let imagePath = product.imagePath;
  if (data.image) {
    await fs.unlink(`public${product.imagePath}`);
    imagePath = `/products/${crypto.randomUUID()}-${image.name}`;
    await fs.writeFile(`public${imagePath}`, data.image);
  }

  await db.product.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  });
  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}
