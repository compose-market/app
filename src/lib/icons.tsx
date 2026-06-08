import {
  Binary,
  Braces,
  FileText,
  Image as ImageIcon,
  Languages,
  ListTree,
  MessageSquare,
  Mic,
  Search,
  Sparkles,
  Tags,
  Video,
} from "lucide-react";

export function typeClass(typeId: string): string {
  if (typeId === "all") return "";
  const id = typeId.toLowerCase();
  if (id.includes("text-generation") || id.includes("text2text")) return "cm-playground__chip--type-text";
  if (id.includes("chat")) return "cm-playground__chip--type-text";
  if (id.includes("image")) return "cm-playground__chip--type-image";
  if (id.includes("audio") || id.includes("speech")) return "cm-playground__chip--type-audio";
  if (id.includes("video")) return "cm-playground__chip--type-video";
  if (id.includes("embedding") || id.includes("feature")) return "cm-playground__chip--type-embedding";
  if (id.includes("conversational")) return "cm-playground__chip--type-conversational";
  if (id.includes("classification")) return "cm-playground__chip--type-classification";
  if (id.includes("translation")) return "cm-playground__chip--type-translation";
  if (id.includes("summarization")) return "cm-playground__chip--type-summarization";
  if (id.includes("research")) return "cm-playground__chip--type-research";
  return "";
}

export function typeIcon(typeId: string, className = "cm-playground__chip-icon") {
  if (typeId === "all") return <Sparkles className={className} />;
  const id = typeId.toLowerCase();
  if (id.includes("image")) return <ImageIcon className={className} />;
  if (id.includes("audio") || id.includes("speech")) return <Mic className={className} />;
  if (id.includes("video")) return <Video className={className} />;
  if (id.includes("embedding") || id.includes("feature")) return <Braces className={className} />;
  if (id.includes("classification")) return <Tags className={className} />;
  if (id.includes("translation")) return <Languages className={className} />;
  if (id.includes("summarization")) return <ListTree className={className} />;
  if (id.includes("research")) return <Search className={className} />;
  if (id.includes("conversational") || id.includes("chat")) return <MessageSquare className={className} />;
  if (id.includes("text-generation") || id.includes("text2text") || id.includes("text")) return <FileText className={className} />;
  return <Binary className={className} />;
}

export function typeLabel(label: string): string {
  if (label === "All Models") return "All";
  return label
    .replace("Text Generation", "Text Gen")
    .replace("Text2text Generation", "Text2Text")
    .replace("Text To Image", "Image")
    .replace("Image To Image", "Img2Img")
    .replace("Text To Video", "Video")
    .replace("Text To Audio", "Audio")
    .replace("Text To Speech", "TTS")
    .replace("Automatic Speech Recognition", "ASR")
    .replace("Speech To Text", "STT")
    .replace("Feature Extraction", "Embedding")
    .replace("Sentence Similarity", "Similarity")
    .replace("Text Classification", "Classify")
    .replace("Image Classification", "Img Classify")
    .replace("Deep Research", "Research");
}
