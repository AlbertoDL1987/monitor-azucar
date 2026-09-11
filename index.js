import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Variables de entorno inyectadas
const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Dexcom Share/3.0.2.11 CFNetwork/1408.0.4 Darwin/22.5.0'
};

async function obtenerSessionId() {
  const authRes = await fetch(`${BASE_URL}/General/AuthenticatePublisherAccountByName`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const accountIdRaw = await authRes.text();
  const accountId = accountIdRaw.replace(/"/g, '').trim();

  if (accountId && accountId !== '00000000-0000-0000-0000-000000000000' && accountId.length > 10) {
    const loginRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountById`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        accountId: accountId,
        password: PASSWORD,
        applicationId: APP_ID
      })
    });

    const sid = (await loginRes.text()).replace(/"/g, '').trim();
    if (sid && sid !== '00000000-0000-0000-0000-000000000000') return sid;
  }

  const directRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountByName`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const directSid = (await directRes.text()).replace(/"/g, '').trim();
  if (!directSid || directSid === '00000000-0000-0000-0000-000000000000' || directSid.length < 10) {
    throw new Error('Credenciales no aceptadas por Dexcom.');
  }

  return directSid;
}

app.get('/glucosa', async (req, res) => {
  try {
    const sessionId = await obtenerSessionId();
    const queryUrl = `${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=1`;

    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Length': '0'
      }
    });

    const bodyTexto = await resp.text();

    if (bodyTexto.trim().startsWith('<')) {
      console.log('--- RESPUESTA RECIBIDA DE DEXCOM ---');
      console.log(bodyTexto.substring(0, 300));
      return res.status(502).json({ 
        error: 'Dexcom envio HTML',
        detalle: bodyTexto.substring(0, 200)
      });
    }
    
    const lecturas = JSON.parse(bodyTexto);

    if (Array.isArray(lecturas) && lecturas.length > 0) {
      const actual = lecturas[0];
      const match = actual.ST ? actual.ST.match(/\d+/) : null;
      const timestamp = match ? parseInt(match[0], 10) : Date.now();

      return res.json({
        mmol: parseFloat((actual.Value / 18.018).toFixed(1)),
        mgdl: actual.Value,
        tendencia: actual.Trend,
        hora: new Date(timestamp).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })
      });
    }

    return res.status(404).json({ error: 'No hay lecturas disponibles' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom en linea');
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});
