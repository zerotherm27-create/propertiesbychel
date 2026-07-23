const IMAGE_MODEL = "gpt-image-2";

const LOOK = "Editorial real-estate photography, natural light, considered composition, understated luxury. No text, no logos, no watermarks, no people's faces in close-up.";

export async function generateImage(openai, { title, dek, section }) {
  const prompt = `${LOOK}\n\nHero image for a ${section === "intelligence" ? "market intelligence note" : "journal essay"} titled "${title}". Context: ${dek || title}. Philippine prime residential property setting.`;

  const result = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1536x1024",
    quality: "high"
  });

  const b64 = result.data[0].b64_json;
  return { b64, contentType: "image/png", alt: title };
}
