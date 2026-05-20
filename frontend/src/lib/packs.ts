export interface PackQuestion {
  prompt: string;
  options: string[];
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
      { prompt: "Best gaming console of all time?", options: ["PlayStation", "Xbox", "Nintendo", "PC"] },
      { prompt: "Favorite game genre?", options: ["FPS", "RPG", "Strategy", "Sports"] },
      { prompt: "Best gaming era?", options: ["90s", "2000s", "2010s", "2020s"] },
      { prompt: "Solo or multiplayer?", options: ["Solo", "Multiplayer", "Depends"] },
      { prompt: "Graphics or gameplay?", options: ["Graphics", "Gameplay", "Both equally"] },
      { prompt: "Physical or digital?", options: ["Physical", "Digital", "Don't care"] },
      { prompt: "Open world or linear?", options: ["Open world", "Linear", "Depends"] },
      { prompt: "Best Nintendo franchise?", options: ["Mario", "Zelda", "Pokémon", "Metroid"] },
      { prompt: "Retro or modern?", options: ["Retro", "Modern", "Both"] },
      { prompt: "Best gaming decade?", options: ["90s/2000s classics", "2010s", "2020s now"] },
    ],
  },
  {
    name: "Anime",
    emoji: "⛩️",
    questions: [
      { prompt: "Best of the Big 3?", options: ["Naruto", "One Piece", "Bleach"] },
      { prompt: "Sub or dub?", options: ["Sub", "Dub", "Depends on the show"] },
      { prompt: "Isekai or Shonen?", options: ["Isekai", "Shonen", "Both are mid"] },
      { prompt: "Best power system?", options: ["Nen (HxH)", "Haki (One Piece)", "Chakra (Naruto)", "Cursed Energy (JJK)"] },
      { prompt: "Goku vs Saitama — who wins?", options: ["Goku", "Saitama", "It's a draw"] },
      { prompt: "Best anime studio?", options: ["MAPPA", "Bones", "Wit", "Ufotable"] },
      { prompt: "Manga or anime?", options: ["Manga", "Anime", "Both"] },
      { prompt: "Demon Slayer — overrated or deserved?", options: ["Overrated", "Deserved", "Somewhere in between"] },
      { prompt: "Shonen or Seinen?", options: ["Shonen", "Seinen", "I watch everything"] },
      { prompt: "Filler — skip or watch?", options: ["Always skip", "Sometimes watch", "Always watch"] },
    ],
  },
  {
    name: "Wildcards",
    emoji: "🃏",
    questions: [
      { prompt: "Pineapple on pizza?", options: ["Yes", "No", "Only sometimes"] },
      { prompt: "Morning person or night owl?", options: ["Morning person", "Night owl", "Neither"] },
      { prompt: "Cats or dogs?", options: ["Cats", "Dogs", "Neither"] },
      { prompt: "Hot or cold weather?", options: ["Hot", "Cold", "Somewhere in between"] },
      { prompt: "Tea or coffee?", options: ["Tea", "Coffee", "Neither"] },
      { prompt: "City or nature?", options: ["City", "Nature", "Suburbs"] },
      { prompt: "Is a hot dog a sandwich?", options: ["Yes", "No", "I refuse to answer"] },
      { prompt: "Phone on the table during dinner?", options: ["Fine", "Rude", "Depends"] },
      { prompt: "Sweet or savoury?", options: ["Sweet", "Savoury", "Both"] },
      { prompt: "Would you rather be rich but bored or broke but passionate?", options: ["Rich and bored", "Broke and passionate"] },
    ],
  },
];
