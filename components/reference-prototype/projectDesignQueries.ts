import type { ExploreTextEntry } from "@/components/reference-prototype/exploreGrid";
import { expandKoreanDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";

type LexiconEntry = {
  pattern: RegExp;
  terms: string[];
};

const SUBJECT_LEXICON: LexiconEntry[] = [
  { pattern: /음악\s*축제|뮤직\s*페스티벌|music\s*festival/i, terms: ["music festival"] },
  { pattern: /축제|페스티벌|festival/i, terms: ["festival"] },
  { pattern: /콘서트|concert/i, terms: ["concert"] },
  { pattern: /음악|뮤직|\bmusic\b/i, terms: ["music"] },
  { pattern: /카페|커피|\bcafe\b|\bcoffee\b/i, terms: ["cafe", "coffee"] },
  { pattern: /포스터|\bposter\b/i, terms: ["poster"] },
  { pattern: /비주얼|시각|\bvisual\b/i, terms: ["visual"] },
  { pattern: /브랜딩|브랜드|\bbrand/i, terms: ["branding"] },
  { pattern: /타이포|typho|typo|typography/i, terms: ["typography"] },
  { pattern: /패키지|packaging/i, terms: ["packaging"] },
  { pattern: /에디토리얼|editorial/i, terms: ["editorial"] },
  { pattern: /웹사이트|웹\s*사이트|website/i, terms: ["website"] },
  { pattern: /앱|\bapp\b|application/i, terms: ["app"] },
  { pattern: /패션|fashion/i, terms: ["fashion"] },
  { pattern: /음식|푸드|\bfood\b/i, terms: ["food"] },
  { pattern: /여행|travel/i, terms: ["travel"] },
  { pattern: /스포츠|sport/i, terms: ["sport"] },
  { pattern: /영화|필름|\bfilm\b/i, terms: ["film"] },
  { pattern: /게임|\bgame\b/i, terms: ["game"] },
  { pattern: /전시|exhibition/i, terms: ["exhibition"] },
  { pattern: /잡지|매거진|magazine/i, terms: ["magazine"] },
  { pattern: /앨범|album/i, terms: ["album"] },
  { pattern: /야시장|마켓|market/i, terms: ["market"] },
  { pattern: /캠페인|campaign/i, terms: ["campaign"] },
  { pattern: /환경|기후|eco|environment/i, terms: ["environment"] },
  { pattern: /교육|education/i, terms: ["education"] },
  { pattern: /뷰티|화장품|beauty|cosmetic/i, terms: ["beauty"] },
  { pattern: /테크|기술|\btech\b/i, terms: ["technology"] },
  { pattern: /도시|시티|\bcity\b/i, terms: ["city"] },
  { pattern: /전통|한옥|traditional/i, terms: ["traditional"] },
  { pattern: /인테리어|가구|interior|furniture/i, terms: ["interior"] },
  { pattern: /호텔|리조트|hotel/i, terms: ["hotel"] },
  { pattern: /웰니스|요가|wellness|yoga/i, terms: ["wellness"] },
  { pattern: /키즈|아동|kids/i, terms: ["kids"] },
  { pattern: /반려동물|펫|\bpet\b/i, terms: ["pet"] },
  { pattern: /바다|해양|ocean|sea/i, terms: ["ocean"] },
  { pattern: /산|캠핑|mountain|camping/i, terms: ["nature"] },
  { pattern: /친환경|지속가능|sustainable/i, terms: ["sustainable"] },
  { pattern: /공연|퍼포먼스|performance/i, terms: ["performance"] },
  { pattern: /출판|도서|책|book|publish/i, terms: ["book"] },
  { pattern: /맥주|와인|주류|beer|wine/i, terms: ["beverage"] },
  { pattern: /한강|서울|seoul/i, terms: ["seoul"] },
];

const MOOD_LEXICON: LexiconEntry[] = [
  { pattern: /펑키|funky/i, terms: ["funky", "playful"] },
  { pattern: /개성|독특|유니크|unique/i, terms: ["bold", "expressive"] },
  { pattern: /에너지|활기|energetic/i, terms: ["energetic"] },
  { pattern: /실험|experimental/i, terms: ["experimental"] },
  { pattern: /비비드|선명|vibrant/i, terms: ["vibrant"] },
  { pattern: /레트로|retro/i, terms: ["retro", "vintage"] },
  { pattern: /사이키|psychedelic/i, terms: ["psychedelic"] },
  { pattern: /따뜻|웜|warm/i, terms: ["warm"] },
  { pattern: /미니멀|minimal/i, terms: ["minimal"] },
  { pattern: /럭셔리|고급|luxury/i, terms: ["luxury"] },
  { pattern: /차가운|쿨|cool/i, terms: ["cool"] },
  { pattern: /어두운|다크|dark/i, terms: ["dark"] },
  { pattern: /밝은|라이트|bright/i, terms: ["bright"] },
  { pattern: /장난|플레이풀|playful/i, terms: ["playful"] },
  { pattern: /우아|엘레강스|elegant/i, terms: ["elegant"] },
  { pattern: /거칠|러프|raw|gritty/i, terms: ["raw"] },
  { pattern: /몽환|드림|dreamy/i, terms: ["dreamy"] },
  { pattern: /키치|kitsch/i, terms: ["kitsch"] },
];

const DISCIPLINE_SUBJECTS = new Set(["poster", "branding", "typography", "editorial", "packaging"]);

function uniqueKeepCase(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function uniqueTerms(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const term = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!term || seen.has(term)) {
      continue;
    }
    seen.add(term);
    result.push(term);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function collectLexiconTerms(text: string, lexicon: LexiconEntry[]): string[] {
  const found: string[] = [];
  for (const entry of lexicon) {
    if (entry.pattern.test(text)) {
      found.push(...entry.terms);
    }
  }
  return uniqueTerms(found);
}

function latinPhrases(text: string): string[] {
  return uniqueTerms(text.match(/[a-z][a-z0-9]+(?:\s+[a-z][a-z0-9]+)*/gi) ?? []);
}

const BARE_MOOD_QUERY = /^(funky|colorful|vibrant|playful|retro|bold|experimental|energetic|minimal|warm|expressive)$/i;

function ensureDesignContextQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "graphic design";
  }
  if (BARE_MOOD_QUERY.test(trimmed)) {
    return `${trimmed} poster design`;
  }
  return trimmed;
}

export type ProjectDesignContext = {
  subjectTerms: string[];
  moodTerms: string[];
  styleTerms: string[];
  disciplineTerms: string[];
  queries: string[];
};

export function expandProjectDesignContext(projectName: string, goal: string): ProjectDesignContext {
  const name = projectName.trim();
  const mood = goal.trim();
  const combined = `${name} ${mood}`;

  const hangulNameTokens = (name.match(/[가-힣]{2,}/g) ?? []).map((token) => token.toLowerCase());
  const topicEnglish = uniqueTerms([
    ...collectLexiconTerms(name, SUBJECT_LEXICON),
    ...expandKoreanDesignQuery(name),
    ...latinPhrases(name),
  ]);
  const subjectTerms = uniqueTerms([
    ...topicEnglish,
    ...collectLexiconTerms(combined, SUBJECT_LEXICON),
    ...latinPhrases(name),
    ...hangulNameTokens,
  ]);
  const moodTerms = uniqueTerms([
    ...collectLexiconTerms(combined, MOOD_LEXICON),
    ...latinPhrases(mood),
  ]);

  const hasPoster = subjectTerms.includes("poster") || /포스터|poster/i.test(combined);
  const hasFestival = subjectTerms.some((term) => term.includes("festival"));
  const hasMusic = subjectTerms.some((term) => term.includes("music") || term.includes("concert"));
  const hasBranding = subjectTerms.includes("branding") || /브랜딩|브랜드|identity/i.test(combined);
  const hasCafe = subjectTerms.some((term) => term.includes("cafe") || term.includes("coffee"));
  const funky = moodTerms.includes("funky") || moodTerms.includes("playful");
  const experimental = moodTerms.includes("experimental") || funky;
  const vibrant = moodTerms.includes("vibrant") || moodTerms.includes("energetic") || funky;
  const minimal = moodTerms.includes("minimal");
  const warm = moodTerms.includes("warm");
  const retro = moodTerms.includes("retro") || moodTerms.includes("vintage");

  const styleTerms = uniqueTerms([
    funky ? "funky" : "",
    vibrant ? "colorful" : "",
    experimental ? "experimental" : "",
    funky || hasFestival ? "psychedelic" : "",
    minimal ? "minimal" : "",
    warm ? "warm" : "",
    "bold",
  ]);

  const disciplineTerms = uniqueTerms([
    hasPoster ? "poster" : "",
    hasBranding ? "branding" : "",
    "typography",
    "editorial",
    hasCafe ? "packaging" : "",
    "illustration",
    hasPoster || experimental ? "graphic design" : "",
  ]);

  const primarySubject =
    subjectTerms.find((term) => !DISCIPLINE_SUBJECTS.has(term)) ?? subjectTerms[0] ?? "visual";
  const primaryMood = moodTerms[0] ?? (hasPoster ? "bold" : "refined");
  const secondMood = moodTerms[1] ?? (minimal ? "minimal" : vibrant ? "vibrant" : "expressive");

  const topicHead =
    topicEnglish[0] && !DISCIPLINE_SUBJECTS.has(topicEnglish[0])
      ? topicEnglish[0]
      : primarySubject;

  const queries = uniqueTerms(
    [
      `${topicHead} ${hasPoster ? "poster" : hasBranding ? "branding" : "graphic"} design`,
      `${topicHead} ${primaryMood} design`,
      `${topicHead} editorial design`,
      hasPoster || hasFestival || hasMusic
        ? `${primarySubject} poster design`
        : hasBranding
          ? `${primarySubject} branding`
          : `${primarySubject} ${disciplineTerms[0] ?? "editorial design"}`,
      funky ? "funky poster design" : `${primaryMood} ${hasPoster ? "poster design" : hasBranding ? "branding" : "editorial design"}`,
      experimental || funky ? "experimental typography" : `${primaryMood} typography`,
      funky || hasFestival ? "psychedelic poster" : `${secondMood} editorial design`,
      hasMusic || hasFestival ? "music festival graphic design" : vibrant || funky ? "colorful graphic design" : `${primaryMood} visual identity`,
      vibrant || funky ? "colorful graphic design" : `${primaryMood} visual identity`,
      vibrant ? "vibrant typography" : "minimal editorial design",
      funky ? "playful editorial design" : `${primarySubject} illustration`,
      hasMusic || hasFestival
        ? "music festival graphic design"
        : hasPoster && (experimental || funky)
          ? "experimental poster design"
          : hasCafe
            ? "cafe packaging design"
            : `${primarySubject} art direction`,
      retro ? "retro poster" : "",
      hasMusic ? "music poster design" : "",
    ]
      .filter(Boolean)
      .map(ensureDesignContextQuery),
    6,
  );

  while (queries.length < 5) {
    const extras = ["editorial layout", "abstract illustration", "art direction", "print design"];
    const next = extras[queries.length] ?? "editorial design";
    if (!queries.includes(next)) {
      queries.push(next);
    } else {
      break;
    }
  }

  return {
    subjectTerms,
    moodTerms,
    styleTerms,
    disciplineTerms,
    queries: queries.slice(0, 6),
  };
}

export function projectRankingTerms(projectName: string, goal: string): string[] {
  const context = expandProjectDesignContext(projectName, goal);
  return uniqueTerms(
    [
      ...context.subjectTerms,
      ...context.moodTerms,
      ...context.styleTerms,
      ...context.disciplineTerms,
    ],
    24,
  );
}

export function buildProjectExploreTexts(projectName: string, goal: string): ExploreTextEntry[] {
  const { subjectTerms, moodTerms } = expandProjectDesignContext(projectName, goal);
  const combined = `${projectName} ${goal}`;
  const hasPoster = subjectTerms.includes("poster") || /포스터|poster/i.test(combined);
  const hasFestival = subjectTerms.some((term) => term.includes("festival") || term.includes("music"));
  const hasBranding = subjectTerms.includes("branding");
  const hasCafe = subjectTerms.some((term) => term.includes("cafe") || term.includes("coffee"));
  const funky = moodTerms.includes("funky") || moodTerms.includes("playful");
  const vibrant = moodTerms.includes("vibrant") || moodTerms.includes("energetic") || funky;
  const experimental = moodTerms.includes("experimental") || funky;
  const minimal = moodTerms.includes("minimal");
  const warm = moodTerms.includes("warm");

  const visualDirection = uniqueKeepCase(
    [
      funky || experimental ? "Bold Typography" : minimal ? "Quiet Typography" : "Bold Typography",
      vibrant ? "Vibrant Color" : warm ? "Warm Color" : "Refined Color",
      experimental || funky ? "Experimental Layout" : minimal ? "Minimal Layout" : "Editorial Layout",
      funky || hasFestival ? "Playful Composition" : warm ? "Warm Composition" : "Balanced Composition",
    ],
    4,
  ).map((label) => ({ label, category: "style" as const }));

  const moodLabels = uniqueKeepCase(
    [
      ...moodTerms.map((term) => term.charAt(0).toUpperCase() + term.slice(1)),
      funky ? "Funky" : "",
      vibrant ? "Vibrant" : "",
      experimental ? "Experimental" : "",
      moodTerms.includes("playful") ? "Playful" : "",
    ],
    5,
  ).map((label) => ({ label, category: "movement" as const }));

  const topicLabels = uniqueKeepCase(
    (projectName.match(/[가-힣]{2,}/g) ?? []).filter((token) => {
      const trimmed = token.trim();
      return trimmed.length >= 2 && trimmed !== projectName.trim();
    }),
    4,
  ).map((label) => ({ label, category: "keyword" as const }));

  const exploration = uniqueKeepCase(
    [
      funky || hasFestival ? "Psychedelic Graphic" : "",
      experimental ? "Experimental Typography" : "Editorial Typography",
      hasFestival ? "Festival Identity" : hasCafe ? "Cafe Identity" : hasBranding ? "Brand Identity" : "Visual Identity",
      hasPoster ? "Poster Design" : hasBranding ? "Brand System" : "Art Direction",
      warm && minimal ? "Warm Minimal Branding" : "",
    ],
    4,
  ).map((label) => ({ label, category: "keyword" as const }));

  const seen = new Set<string>();
  const merged: ExploreTextEntry[] = [];
  for (const entry of [...topicLabels, ...visualDirection, ...moodLabels, ...exploration]) {
    const key = entry.label.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ label: entry.label.trim(), category: entry.category });
  }
  return merged;
}
