const https = require('https');

module.exports = async (req, res) => {
    // Cabeceras de seguridad
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-goog-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido" });
    }

    try {
        let body = {};
        if (req.body) {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }

        const textoEstudiante = (body.texto || "").substring(0, 8000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 400);
        const ejemplosIA = (body.ia || "").substring(0, 400);
        const API_KEY = process.env.API_KEY_SECRETA;

        if (!API_KEY) {
            return res.status(200).json({ error: "Falta API KEY secreta en Vercel." });
        }

        // TÁCTICA NUEVA: Formato de texto plano con etiquetas. 
        // Es imposible que la IA rompa esto con comillas o saltos de línea.
        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial especializado en textos académicos universitarios en Chile.\n" +
            "Analiza el texto basándote en la calibración y devuelve tu veredicto usando ESTRICTAMENTE este formato de etiquetas exactas:\n\n" +
            "[MIN]: (ingresa aquí un número de 0 a 100)\n" +
            "[MAX]: (ingresa aquí un número de 0 a 100)\n" +
            "[NIVEL]: (ingresa aquí solo la palabra Bajo, Moderado o Alto)\n" +
            "[JUSTIFICACION]: (Redacta aquí tu análisis detallado. Cita frases del texto y explica por qué te parecen hechas por IA o por humano. Puedes usar los párrafos, comillas y saltos de línea que necesites.)\n\n" +
            "Ejemplos Humanos: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante;

        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.2, 
                maxOutputTokens: 800
            }
        });

        const llamarGemini = () => {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    path: '/v1beta/models/gemini-flash-latest:generateContent', 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': API_KEY,
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 25000
                };

                const request = https.request(options, (response) => {
                    let buffer = '';
                    response.on('data', (chunk) => buffer += chunk);
                    response.on('end', () => resolve({ statusCode: response.statusCode, body: buffer }));
                });

                request.on('error', reject);
                request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
                request.write(postData);
                request.end();
            });
        };

        const gcpResponse = await llamarGemini();

        if (gcpResponse.statusCode !== 200) {
            return res.status(200).json({ error: "Error de red (" + gcpResponse.statusCode + "): " + gcpResponse.body });
        }

        const datosGCP = JSON.parse(gcpResponse.body);
        const textoRespuesta = datosGCP.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoRespuesta) {
            return res.status(200).json({ error: "La API devolvió un análisis en blanco." });
        }

        // EL FRANCOTIRADOR: Extraemos los datos basándonos en las etiquetas exactas
        const matchMin = textoRespuesta.match(/\[MIN\]:\s*(\d+)/i);
        const matchMax = textoRespuesta.match(/\[MAX\]:\s*(\d+)/i);
        const matchNiv = textoRespuesta.match(/\[NIVEL\]:\s*([^\n]+)/i);
        const matchJus = textoRespuesta.match(/\[JUSTIFICACION\]:\s*([\s\S]+)/i);

        // Armamos el JSON limpio y perfecto que tu página web está esperando
        const datosFinales = {
            rango_minimo: matchMin ? parseInt(matchMin[1]) : 15,
            rango_maximo: matchMax ? parseInt(matchMax[1]) : 35,
            nivel_sospecha: matchNiv ? matchNiv[1].trim() : "Moderado",
            justificacion: matchJus ? matchJus[1].trim() : textoRespuesta // Si omite la etiqueta, mandamos todo el texto
        };

        return res.status(200).json(datosFinales);

    } catch (error) {
        return res.status(200).json({ error: "Fallo en el servidor: " + error.message });
    }
};
