import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "modalresearch_RGMCh0ESKN7KSzd_2aSMkcoG35Xkrp46HJzYMnl6qmk",
  baseURL: "https://api.us-west-2.modal.direct/v1",
});

async function run() {
  const completion = await client.chat.completions.create({
    model: "zai-org/GLM-5-FP8",
    messages: [
      { role: "user", content: "How many r-s are in strawberry?" },
    ],
    max_tokens: 500,
  });

  console.log(completion.choices[0].message);
}

run().catch(console.error);
