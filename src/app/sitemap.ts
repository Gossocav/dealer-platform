import type { MetadataRoute } from "next";

const appBaseUrl =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

function absolute(pathname: string) {
  return `${appBaseUrl.replace(/\/$/, "")}${pathname}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: absolute("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absolute("/auto"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absolute("/ricerca"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absolute("/concessionarie"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
