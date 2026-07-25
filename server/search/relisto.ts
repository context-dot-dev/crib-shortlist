import { discoverExtractedInventory } from "./extracted-inventory";
import type { Preferences } from "./schemas";

const CONFIG = {
  id: "relisto",
  inventoryUrl: "https://www.relisto.com/search/",
  instructions:
    "Extract every currently available whole-apartment rental in San Francisco, up to 50. Use the exact public detail-page URL, numeric monthly rent, bedrooms, bathrooms, address, square feet and all visible image URLs. Exclude rooms, SROs, rented or application-received properties, navigation, and properties outside San Francisco. Do not invent missing values.",
  caveat: "Live ReLISTO inventory. Verify availability before applying.",
  requireSanFranciscoAddress: true,
} as const;

export function discoverRelistoListings(
  preferences: Preferences,
  apiKey: string,
) {
  return discoverExtractedInventory(CONFIG, preferences, apiKey);
}
