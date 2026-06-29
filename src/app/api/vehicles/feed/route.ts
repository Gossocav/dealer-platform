import { NextResponse } from "next/server";

type FeedType = "auto" | "csv" | "xml" | "json";

type FeedPreviewItem = Record<string, unknown> | string;

const MAX_FEED_BYTES = 1_000_000;
const MAX_PREVIEW_ITEMS = 10;
const COMMON_JSON_ARRAY_KEYS = ["vehicles", "cars", "data", "items", "stock"];
const XML_REPEAT_TAGS = ["vehicle", "car", "item", "auto"];
const AUTOMOTIVE_XML_MARKERS = ["make", "brand", "marca", "model", "modello", "vehicle", "auto"];

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        const overflow = totalBytes - maxBytes;
        const allowedLength = value.byteLength - overflow;
        if (allowedLength > 0) {
          chunks.push(decoder.decode(value.slice(0, allowedLength), { stream: true }));
        }
        break;
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    result = chunks.join("") + decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return result;
}

function isLikelyJson(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  return (trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.endsWith("}") || trimmed.endsWith("]");
}

function isLikelyXml(content: string) {
  const trimmed = content.trimStart();
  return trimmed.startsWith("<") || /<\/?[a-zA-Z][\w:-]*(\s[^>]*)?>/.test(content);
}

function isLikelyCsv(content: string) {
  const sample = content.slice(0, 2000);
  return sample.includes(",") || sample.includes(";");
}

function detectDelimiter(sample: string) {
  const commaCount = (sample.match(/,/g) ?? []).length;
  const semicolonCount = (sample.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      rowsCount: 0,
      preview: [] as FeedPreviewItem[],
    };
  }

  const delimiter = detectDelimiter(lines.slice(0, 5).join("\n"));
  const header = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1);
  const preview = rows.slice(0, MAX_PREVIEW_ITEMS).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const entry: Record<string, unknown> = {};

    header.forEach((column, index) => {
      entry[column || `col_${index + 1}`] = values[index] ?? "";
    });

    return entry;
  });

  return {
    rowsCount: rows.length,
    preview,
  };
}

function abbreviateText(value: string, maxLength = 220) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength)}...`;
}

function parseXml(content: string) {
  const preview: string[] = [];
  let rowsCount = 0;

  for (const tag of XML_REPEAT_TAGS) {
    const tagPattern = new RegExp(`<${tag}\\b[\\s\\S]*?<\/${tag}>`, "gi");
    const matches = content.match(tagPattern) ?? [];
    if (matches.length > 0) {
      rowsCount += matches.length;
      for (const match of matches.slice(0, MAX_PREVIEW_ITEMS - preview.length)) {
        preview.push(abbreviateText(match));
      }
    }
  }

  if (rowsCount === 0) {
    const genericMatches = content.match(/<([a-zA-Z][\w:-]*)\b[\s\S]*?<\/\1>/g) ?? [];
    rowsCount = genericMatches.length;
    for (const match of genericMatches.slice(0, MAX_PREVIEW_ITEMS)) {
      preview.push(abbreviateText(match));
    }
  }

  return {
    rowsCount,
    preview,
  };
}

function isAutomotiveXmlFeed(content: string) {
  return AUTOMOTIVE_XML_MARKERS.some((marker) => {
    const tagPattern = new RegExp(`<\\/?\\s*${marker}\\b`, "i");
    const attributePattern = new RegExp(`\\b[a-zA-Z_:-]+\\s*=\\s*["']${marker}["']`, "i");

    return tagPattern.test(content) || attributePattern.test(content);
  });
}

function findFirstArrayInObject(value: Record<string, unknown>) {
  for (const key of COMMON_JSON_ARRAY_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseJson(content: string) {
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return {
      rowsCount: parsed.length,
      preview: parsed.slice(0, MAX_PREVIEW_ITEMS) as FeedPreviewItem[],
    };
  }

  if (parsed && typeof parsed === "object") {
    const objectValue = parsed as Record<string, unknown>;
    const arrayValue = findFirstArrayInObject(objectValue);

    if (arrayValue) {
      return {
        rowsCount: arrayValue.length,
        preview: arrayValue.slice(0, MAX_PREVIEW_ITEMS) as FeedPreviewItem[],
      };
    }

    return {
      rowsCount: 1,
      preview: [objectValue],
    };
  }

  return {
    rowsCount: 1,
    preview: [parsed as FeedPreviewItem],
  };
}

function detectFeedType(content: string, requestedType: FeedType) {
  const normalizedType = requestedType === "auto" ? null : requestedType;

  if (normalizedType === "json") {
    try {
      parseJson(content);
      return "json" as const;
    } catch {
      // fall through to sniffing
    }
  }

  if (normalizedType === "xml") {
    if (isLikelyXml(content)) {
      return "xml" as const;
    }
  }

  if (normalizedType === "csv") {
    if (isLikelyCsv(content)) {
      return "csv" as const;
    }
  }

  if (isLikelyJson(content)) {
    try {
      parseJson(content);
      return "json" as const;
    } catch {
      // continue sniffing other formats
    }
  }

  if (isLikelyXml(content)) {
    return "xml" as const;
  }

  return "csv" as const;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    type?: FeedType;
  };

  const url = body.url?.trim();
  const requestedType = body.type ?? "auto";

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed obbligatorio",
      },
      { status: 400 },
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed non valido",
      },
      { status: 400 },
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "DealerPlatformFeedAnalyzer/1.0",
        accept: "application/json, text/xml, application/xml, text/csv, text/plain, */*",
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Feed non raggiungibile",
      },
      { status: 400 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message: "Feed non raggiungibile",
      },
      { status: 400 },
    );
  }

  const content = await readLimitedText(response, MAX_FEED_BYTES);

  let detectedType: "json" | "xml" | "csv";
  let analysis: {
    rowsCount: number;
    preview: FeedPreviewItem[];
  };

  try {
    detectedType = detectFeedType(content, requestedType);

    if (detectedType === "json") {
      analysis = parseJson(content);
    } else if (detectedType === "xml") {
      if (!isAutomotiveXmlFeed(content)) {
        return NextResponse.json(
          {
            success: false,
            message: "Il feed è valido ma non contiene dati di veicoli.",
          },
          { status: 400 },
        );
      }

      analysis = parseXml(content);
    } else {
      analysis = parseCsv(content);
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Feed non raggiungibile",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Feed analizzato correttamente",
    detectedType,
    rowsCount: analysis.rowsCount,
    preview: analysis.preview,
  });
}
