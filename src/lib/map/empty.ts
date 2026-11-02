import type { OfficeMap } from "../../engine/map.js";

export const emptyMap = (): OfficeMap => ({
  version: 1, name: "", backdrop: "city",
  floors: [{ id: "f1", name: "1F", rooms: [], walls: [], doors: [], items: [] }],
});
