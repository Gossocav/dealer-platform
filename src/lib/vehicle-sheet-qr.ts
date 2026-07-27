import qrcode from "qrcode-generator";

/**
 * Builds a QR code as SVG path data, for the printable vehicle sheet.
 *
 * The code carries the listing URL directly rather than pointing at a
 * redirect service. That matters here: the sheets get taped to windscreens
 * and may stay there for months, so the code has to keep working with no
 * third party in the middle and nothing to renew.
 */

export type VehicleSheetQr = {
  /** SVG path data, one square per dark module. */
  path: string;
  /** Side of the viewBox, quiet zone included. */
  size: number;
};

/**
 * The spec mandates a 4-module quiet zone; scanners get unreliable without
 * it, especially against a printed border.
 */
const QUIET_ZONE = 4;

export function buildVehicleSheetQr(url: string): VehicleSheetQr {
  const text = String(url ?? "").trim();

  if (!text) {
    throw new Error("URL mancante per il codice QR.");
  }

  // Level M tolerates roughly 15% damage. Worth having on a sheet exposed to
  // sunlight and condensation behind glass; L would print marginally smaller
  // but is fragile once the paper starts to age.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const squares: string[] = [];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (qr.isDark(row, column)) {
        squares.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  return {
    path: squares.join(""),
    size: moduleCount + QUIET_ZONE * 2,
  };
}
