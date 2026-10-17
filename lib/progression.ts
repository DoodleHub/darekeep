// Cosmetic-only progression. Nothing here affects competitive stats.

export const levelFor = (xp: number) => Math.floor(xp / 100) + 1;
export const xpIntoLevel = (xp: number) => xp % 100;

export const OUTFITS = [
  { name: "Azure", hue: 0, level: 1 },
  { name: "Crimson", hue: 135, level: 2 },
  { name: "Verdant", hue: 250, level: 3 },
  { name: "Royal", hue: 50, level: 4 },
  { name: "Amber", hue: 180, level: 5 },
];

export const SWORDS = [
  { name: "Frost", level: 1 },
  { name: "Ember", level: 2 },
  { name: "Venom", level: 3 },
  { name: "Rose", level: 5 },
  { name: "Void", level: 6 },
];

export const THEME_UNLOCKS = [1, 2, 4, 5];

export const BADGES = [
  { name: "Rookie", icon: "ui_key", level: 1 },
  { name: "Delver", icon: "medal_escape", level: 3 },
  { name: "Keeper", icon: "medal_treasure", level: 5 },
  { name: "Darekeeper", icon: "medal_flawless", level: 6 },
] as const;

export const CREATOR_MILESTONES = [
  { name: "First Visitor", need: 1 },
  { name: "Crowd Pleaser", need: 10 },
  { name: "Dungeon Master", need: 50 },
  { name: "Legend", need: 250 },
];
