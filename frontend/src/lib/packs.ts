export interface PackQuestion {
  prompt: string;
  type: "vote" | "freetext";
  options?: string[];
}

export interface Pack {
  name: string;
  emoji: string;
  questions: PackQuestion[];
}

export const packs: Pack[] = [
  {
    name: "Gaming",
    emoji: "🎮",
    questions: [
      { prompt: "Best gaming console of all time?", type: "vote", options: ["PlayStation", "Xbox", "Nintendo", "PC"] },
      { prompt: "Most overrated game of all time?", type: "freetext" },
      { prompt: "Favorite game genre?", type: "vote", options: ["FPS", "RPG", "Strategy", "Sports"] },
      { prompt: "Hardest game you've ever played?", type: "freetext" },
      { prompt: "Best gaming era?", type: "vote", options: ["90s", "2000s", "2010s", "2020s"] },
      { prompt: "Solo or multiplayer?", type: "vote", options: ["Solo", "Multiplayer", "Depends"] },
      { prompt: "What game would you delete from existence?", type: "freetext" },
    ],
  },
  {
    name: "Anime",
    emoji: "⛩️",
    questions: [
      { prompt: "Best of the Big 3?", type: "vote", options: ["Naruto", "One Piece", "Bleach"] },
      { prompt: "Most iconic anime villain?", type: "freetext" },
      { prompt: "Best anime arc of all time?", type: "freetext" },
      { prompt: "Isekai or Shonen?", type: "vote", options: ["Isekai", "Shonen", "Both are mid"] },
      { prompt: "Most underrated anime?", type: "freetext" },
      { prompt: "Sub or dub?", type: "vote", options: ["Sub", "Dub", "Depends on the show"] },
      { prompt: "Which anime world would you actually want to live in?", type: "freetext" },
    ],
  },
  {
    name: "Wildcards",
    emoji: "🃏",
    questions: [
      { prompt: "If you could only eat one food forever, what is it?", type: "freetext" },
      { prompt: "Pineapple on pizza?", type: "vote", options: ["Yes", "No", "Only sometimes"] },
      { prompt: "Most useless superpower?", type: "freetext" },
      { prompt: "Morning person or night owl?", type: "vote", options: ["Morning", "Night owl", "Neither"] },
      { prompt: "What would your supervillain name be?", type: "freetext" },
      { prompt: "Cats or dogs?", type: "vote", options: ["Cats", "Dogs", "Neither"] },
      { prompt: "What's a hill you'd die on?", type: "freetext" },
    ],
  },
];
