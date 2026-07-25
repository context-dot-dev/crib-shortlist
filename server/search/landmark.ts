import { discoverExtractedInventory } from "./extracted-inventory";
import type { Preferences } from "./schemas";

const CONFIG = {
  id: "landmark",
  inventoryUrl: "https://www.landmarksf.com/floorplans",
  instructions:
    "Extract every currently available San Francisco apartment floor plan, up to 50. Use the exact public floor-plan URL, numeric starting monthly rent, bedrooms, bathrooms, square feet, availability and all visible image URLs. Exclude navigation and unavailable floor plans. Do not invent missing values.",
  caveat:
    "Live Landmark SF floor-plan inventory. Confirm the exact unit and price before applying.",
  defaultAddress: "573 S Van Ness Ave, San Francisco, CA 94110",
  requireSanFranciscoAddress: true,
} as const;

export function discoverLandmarkListings(
  preferences: Preferences,
  apiKey: string,
) {
  return discoverExtractedInventory(CONFIG, preferences, apiKey);
}
