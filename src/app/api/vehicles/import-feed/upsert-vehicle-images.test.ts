import { describe, expect, it } from "vitest";
import { upsertVehicleImages } from "./route";

type FakeRow = { id: string; image_url: string; origine_url?: string | null };

// Minimal stand-in for the two Supabase chains this function uses:
// .from("vehicle_images").select(...).eq(...).order(...) and .insert(...).
function createFakeSupabase(existingRows: FakeRow[]) {
  const insertedBatches: Array<Record<string, unknown>[]> = [];

  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: existingRows, error: null }),
        }),
      }),
      insert: (rows: Record<string, unknown>[]) => {
        insertedBatches.push(rows);
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };

  return { client, insertedBatches };
}

const DEALER_ID = "dealer-1";
const VEHICLE_ID = "vehicle-1";

describe("upsertVehicleImages", () => {
  it("caps a fresh vehicle at 20 images and marks the first as cover", async () => {
    const { client, insertedBatches } = createFakeSupabase([]);
    const urls = Array.from({ length: 25 }, (_, i) => `https://cdn.example.com/${i}.jpg`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, urls);

    expect(insertedBatches).toHaveLength(1);
    expect(insertedBatches[0]).toHaveLength(20);
    expect(insertedBatches[0][0]).toMatchObject({ image_url: "https://cdn.example.com/0.jpg", is_cover: true });
    expect(insertedBatches[0][19]).toMatchObject({ image_url: "https://cdn.example.com/19.jpg", position: 19 });
  });

  it("only fills the remaining slots when the vehicle already has images", async () => {
    const existing = Array.from({ length: 15 }, (_, i) => ({ id: `img-${i}`, image_url: `https://cdn.example.com/existing-${i}.jpg` }));
    const { client, insertedBatches } = createFakeSupabase(existing);
    const newUrls = Array.from({ length: 10 }, (_, i) => `https://cdn.example.com/new-${i}.jpg`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, newUrls);

    expect(insertedBatches).toHaveLength(1);
    // 15 existing + 5 new = 20, not 15 + 10 = 25.
    expect(insertedBatches[0]).toHaveLength(5);
    expect(insertedBatches[0][0]).toMatchObject({ image_url: "https://cdn.example.com/new-0.jpg", position: 15 });
  });

  it("inserts nothing once a vehicle is already at the cap", async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ id: `img-${i}`, image_url: `https://cdn.example.com/existing-${i}.jpg` }));
    const { client, insertedBatches } = createFakeSupabase(existing);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, ["https://cdn.example.com/one-more.jpg"]);

    expect(insertedBatches).toHaveLength(0);
  });

  it("does not let already-stored URLs consume a slot meant for new ones", async () => {
    const existing = [{ id: "img-0", image_url: "https://cdn.example.com/dup.jpg" }];
    const { client, insertedBatches } = createFakeSupabase(existing);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, [
      "https://cdn.example.com/dup.jpg",
      "https://cdn.example.com/fresh.jpg",
    ]);

    expect(insertedBatches).toHaveLength(1);
    expect(insertedBatches[0]).toHaveLength(1);
    expect(insertedBatches[0][0]).toMatchObject({ image_url: "https://cdn.example.com/fresh.jpg" });
  });
});

/**
 * Il difetto che impedisce, 25/09/2026: il confronto era su `image_url`.
 * Dopo la copia di una foto nel nostro archivio l'indirizzo diventa un
 * percorso nostro, e la stessa foto rimandata dal feed non si riconosceva
 * piu': una galleria da 8 foto arrivava a 20 righe in tre importazioni, la
 * prima ripetuta tre volte (misurato da un revisore con questa funzione).
 */
describe("upsertVehicleImages riconosce una foto per identita', non per indirizzo", () => {
  const origine = (n: string, misura = "1600x0") => `https://cdn.dealerk.it/dealer/datafiles/vehicle/images/${misura}/2396/${n}.jpg`;

  it("una foto gia' copiata, rimandata dal feed, non rientra come doppione", async () => {
    const existing = [
      { id: "img-0", image_url: `${DEALER_ID}/${VEHICLE_ID}/sha0.jpg`, origine_url: origine("a") },
      { id: "img-1", image_url: `${DEALER_ID}/${VEHICLE_ID}/sha1.jpg`, origine_url: origine("b") },
    ];
    const { client, insertedBatches } = createFakeSupabase(existing);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, [origine("a"), origine("b", "800x0")]);

    expect(insertedBatches).toHaveLength(0);
  });

  it("una foto nuova entra con la sua origine, cosi' la copia la fa il programma", async () => {
    const { client, insertedBatches } = createFakeSupabase([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await upsertVehicleImages(client as any, DEALER_ID, VEHICLE_ID, [origine("a")]);

    expect(insertedBatches[0][0]).toMatchObject({ image_url: origine("a"), origine_url: origine("a") });
  });
});
