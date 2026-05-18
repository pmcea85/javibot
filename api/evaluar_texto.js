module.exports = async (req, res) => {
    // Encabezados de Red Seguros (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
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
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        const textoEstudiante = (body.texto || "").substring(0, 8000);
        const ejemplosHumanos = (body.humanos || "").substring(0, 400);
        const ejemplosIA = (body.ia || "").substring(0, 400);

        const API_KEY = process.env.API_KEY_SECRETA;
        if (!API_KEY) {
            return res.status(200).json({ 
                probabilidad_ia: 0, 
                veredicto: "Falta API KEY", 
                analisis: "Configura la variable API_KEY_SECRETA en el panel de Vercel." 
            });
        }

        // URL exacta de tu cURL
        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

        const promptText = 
            "Eres JaviBot, un detector de inteligencia artificial para ámbitos académicos universitarios en Chile. " +
            "Analiza el siguiente texto usando la calibración adjunta.\n\n" +
            "Ejemplos Humanos: " + ejemplosHumanos + ".\n" +
            "Ejemplos IA: " + ejemplosIA + ".\n" +
            "Texto a evaluar: " + textoEstudiante + ".\n\n" +
            "Devuelve OBLIGATORIAMENTE un objeto JSON plano de una sola línea (sin usar formato markdown ni bloques 
http://googleusercontent.com/immersive_entry_chip/0

*(Nota de seguridad: Recuerda que la API Key real que venía en tu cURL no debe quedar escrita directamente en este código de GitHub para que no sea pública; asegúrate de ponerla en el panel de Vercel como `API_KEY_SECRETA`).*

Sube este cambio, dale unos segundos para que actualice en la nube y JaviBot debería empezar a evaluar con datos reales de inmediato.
