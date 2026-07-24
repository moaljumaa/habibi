import type { NextApiRequest, NextApiResponse } from "next";
import { listBrands, createBrand, deleteBrand } from "@/lib/data";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(listBrands());
  }
  if (req.method === "POST") {
    const { name, is_self, domains, description, industry, adjectives, products, url } =
      req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    const doms = Array.isArray(domains)
      ? domains.map((d: string) => d.trim()).filter(Boolean)
      : [];
    const strList = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    return res.status(201).json(
      createBrand(name.trim(), !!is_self, doms, {
        description: description?.trim() || null,
        industry: industry?.trim() || null,
        adjectives: strList(adjectives),
        products: strList(products),
        url: url?.trim() || null,
      })
    );
  }
  if (req.method === "DELETE") {
    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: "id required" });
    deleteBrand(id);
    return res.status(204).end();
  }
  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).end();
}
