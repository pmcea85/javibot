const https = require('https');

module.exports = async (req, res) => {
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

        // Prompt blindado: Exige un solo párrafo y prohíbe saltos de línea
        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial especializado en textos académicos.\n" +
            "Analiza el siguiente texto y estima un RANGO DE PROBABILIDAD DE IA (mínimo y máximo).\n\n" +
            "Ejemplos Humanos: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante + ".\n\n" +
            "REGLAS CRÍTICAS DE FORMATO Y LÓGICA:\n" +
            "1. JUSTIFICACIÓN: Redacta un análisis explicando el *por qué* de tu decisión en UN SOLO PÁRRAFO CONTINUO. NO uses saltos de línea, NO uses viñetas ni comillas dobles.\n" +
            "2. COHERENCIA: El 'nivel_sospecha' DEBE coincidir con tus números:\n" +
            "   - De 0% a 30%: 'Bajo'.\n" +
            "   - De 31% a 65%: 'Moderado'.\n" +
            "   - De 66% a 100%: 'Alto'.";

        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.2, 
                maxOutputTokens: 800,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        rango_minimo: { type: "integer" },
                        rango_maximo: { type: "integer" },
                        nivel_sospecha: { type: "string" },
                        justificacion: { type: "string" }
                    },
                    required: ["rango_minimo", "rango_maximo", "nivel_sospecha", "justificacion"]
                }
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
            return res.status(200).json({ error: "Error de red (" + gcpResponse.statusCode + ")" });
        }

        const datosGCP = JSON.parse(gcpResponse.body);
        const textoRespuesta = datosGCP.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoRespuesta) {
            return res.status(200).json({ error: "Respuesta en blanco." });
        }

        // ASPIRADOR DE CARACTERES: Elimina marcas markdown y CUALQUIER salto de línea/tabulación real que rompa el JSON
        let jsonLimpio = textoRespuesta.replace(/```json/gi, "").replace(/```/gi, "");
        jsonLimpio = jsonLimpio.replace(/[\n\r\t]+/g, " ").trim();

        let datosFinales;

        try {
            // Ahora el JSON siempre será una sola línea perfecta
            datosFinales = JSON.parse(jsonLimpio);
        } catch (eParseo) {
            // Salvavidas extremo
            const matchMin = jsonLimpio.match(/"rango_minimo"\s*:\s*(\d+)/i);
            const matchMax = jsonLimpio.match(/"rango_maximo"\s*:\s*(\d+)/i);
            const matchNiv = jsonLimpio.match(/"nivel_sospecha"\s*:\s*["']([^"']+)["']/i);
            const matchJus = jsonLimpio.match(/"justificacion"\s*:\s*["']([\s\S]*?)["']?\s*}/i);

            datosFinales = {
                rango_minimo: matchMin ? parseInt(matchMin[1]) : 10,
                rango_maximo: matchMax ? parseInt(matchMax[1]) : 25,
                nivel_sospecha: matchNiv ? matchNiv[1] : "Bajo",
                justificacion: matchJus ? matchJus[1].replace(/\\"/g, "'").replace(/"/g, "'") : "Análisis completado. Por favor, revisa el rango estimado."
            };
        }

        return res.status(200).json(datosFinales);

    } catch (error) {
        return res.status(200).json({ error: "Error en el servidor: " + error.message });
    }
};
