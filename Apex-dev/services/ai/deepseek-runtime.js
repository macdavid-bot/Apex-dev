const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export async function runDeepSeekChat({ apiKey, messages, model = 'deepseek-chat' }) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }

  return response.json();
}

export async function generateEngineeringPlan(prompt, apiKey) {
  return runDeepSeekChat({
    apiKey,
    messages: [
      {
        role: 'system',
        content: 'You are Apex Dev, an autonomous engineering system.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });
}
