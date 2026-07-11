const MODEL = 'gpt-5.4-mini';

function buildMessages(birthDate, birthTime) {
  const timeLine = birthTime
    ? `태어난 시간: ${birthTime}`
    : '태어난 시간: 알려지지 않음 (시간 정보 없이 분석)';

  const system = [
    '너는 한국 전통 사주(四柱) 명리학을 참고해 로또 6/45 번호를 추천하는 오락용 어시스턴트다.',
    '실제 명리학적 정확성을 보장하지 않는 재미용 콘텐츠임을 감안하고, 생년월일(과 가능하면 태어난 시간)에서 연상되는 오행(五行)·간지 이미지를 근거로 1~45 사이의 서로 다른 정수 6개를 골라라.',
    '반드시 아래 JSON 형식으로만 답하고, 다른 텍스트나 마크다운은 절대 포함하지 마라.',
    '{"numbers":[1~45 사이 중복 없는 정수 6개, 오름차순],"reason":"사주 해석에 기반한 한국어 추천 이유. 2~3문장, 존댓말"}',
  ].join('\n');

  const user = [
    `생년월일: ${birthDate}`,
    timeLine,
    '위 정보를 바탕으로 사주 기반 로또 번호 6개와 추천 이유를 JSON으로 알려줘.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function sanitizeNumbers(raw) {
  const set = new Set();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 45) set.add(n);
      if (set.size === 6) break;
    }
  }
  while (set.size < 6) {
    set.add(1 + Math.floor(Math.random() * 45));
  }
  return Array.from(set).sort((a, b) => a - b);
}

async function callOpenAI(apiKey, messages) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const message = data?.error?.message || 'OpenAI API 요청이 실패했습니다.';
    const err = new Error(message);
    err.status = r.status;
    throw err;
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '허용되지 않은 요청 방식입니다.' });
    return;
  }

  const { birthDate, birthTime } = req.body || {};

  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.status(400).json({ error: '생년월일을 YYYY-MM-DD 형식으로 입력해주세요.' });
    return;
  }
  if (birthTime && !/^\d{2}:\d{2}$/.test(birthTime)) {
    res.status(400).json({ error: '태어난 시간 형식이 올바르지 않습니다.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다.' });
    return;
  }

  try {
    const messages = buildMessages(birthDate, birthTime || null);
    const completion = await callOpenAI(apiKey, messages);
    const content = completion?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const numbers = sanitizeNumbers(parsed.numbers);
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : '입력하신 생년월일을 바탕으로 오행의 기운이 조화를 이루는 번호를 골라봤어요.';

    res.status(200).json({ numbers, reason });
  } catch (e) {
    res.status(e.status && e.status < 500 ? 502 : 500).json({
      error: e.message || '사주 분석 중 오류가 발생했습니다.',
    });
  }
};
