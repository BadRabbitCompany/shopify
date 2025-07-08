import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// CREDENCIALES DE CONTIFICO PROPORCIONADAS
const CONTIFICO_API_KEY = "FrguR1kDpFHaXHLQwplZ2CwTX3p8p9XHVTnukL98V5U";
const CONTIFICO_TOKEN = "dce704ae-189e-4545-bea3-257d9249a594";
const CONTIFICO_API = "https://api.contifico.com/sistema/api/v1";

// Webhook URL for reference
const WEBHOOK_URL = "https://shopify-pwqd.onrender.com/webhook";

// Verificar webhook de Shopify (simplificado sin HMAC)
function verifyShopifyWebhook(req, res, next) {
  const topicHeader = req.get('X-Shopify-Topic');
  const shopHeader = req.get('X-Shopify-Shop-Domain');

  if (!topicHeader || !shopHeader) {
    console.log('❌ Headers de Shopify faltantes');
    return res.status(401).send('Unauthorized');
  }

  // Verificar que sea un webhook de órdenes
  if (topicHeader !== 'orders/create' && topicHeader !== 'orders/updated') {
    console.log('❌ Webhook topic no válido:', topicHeader);
    return res.status(400).send('Invalid webhook topic');
  }

  console.log('✅ Webhook recibido de:', shopHeader, 'Topic:', topicHeader);
  next();
}

// Función para convertir valores numéricos de forma segura
function safeParseFloat(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseInt(value, defaultValue = 1) {
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeString(value, defaultValue = "") {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const str = String(value).trim();
  return str || defaultValue;
}

// Generador de número de documento simulado
function generateDocNumber(order) {
  const base = "001-001-";
  const padded = order.id.toString().padStart(9, "0");
  return base + padded;
}

// Formatear fecha para Contifico (DD/MM/YYYY)
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    
    // Verificar si la fecha es válida
    if (isNaN(date.getTime())) {
      console.log('⚠️ Fecha inválida, usando fecha actual');
      const today = new Date();
      const day = today.getDate().toString().padStart(2, '0');
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const year = today.getFullYear();
      return `${day}/${month}/${year}`;
    }
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.log('⚠️ Error formateando fecha, usando fecha actual');
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

app.get('/', (req, res) => {
  res.send('✅ Webhook conectado. Esperando órdenes de Shopify...');
});

app.post('/webhook', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Pedido recibido de Shopify:");
    console.log(`ID: ${order.id}, Total: ${order.total_price}, Estado: ${order.financial_status}`);

    // Validar datos requeridos
    if (!order.id || !order.line_items || !order.line_items.length) {
      console.log('❌ Datos de orden incompletos');
      return res.status(400).send({ error: 'Datos de orden incompletos' });
    }

    // Mapear datos de Shopify a Contifico
    const fechaEmision = formatDate(order.created_at);
    console.log('📅 Fecha original de Shopify:', order.created_at);
    console.log('📅 Fecha formateada para Contifico:', fechaEmision);
    
    // Validar datos críticos
    if (!order.line_items || order.line_items.length === 0) {
      console.log('❌ No hay items en la orden');
      return res.status(400).send({ error: 'Orden sin items' });
    }
    
    // Crear documento mínimo para testing - usando datos hardcodeados para aislar el problema
    console.log('🧪 Usando documento de prueba con datos fijos');
    const ventaDoc = {
      pos: CONTIFICO_TOKEN,
      fecha_emision: fechaEmision,
      tipo_documento: "FAC",
      establecimiento: "001", // Nuevo campo requerido
      punto_emision: "001",   // Nuevo campo requerido
      documento: generateDocNumber(order),
      estado: "P",
      electronico: false,
      autorizacion: "",
      cliente: {
        cedula: "9999999999",
        razon_social: "Cliente Shopify",
        email: "test@example.com",
        direccion: "Test Address",
        telefono: "123456789",
        tipo: "CLIENTE"
      },
      detalles: [{
        producto_id: "PROD-001", // Cambia esto por un código válido de tu inventario si lo tienes
        cantidad: 1,
        precio: 100.00,
        porcentaje_iva: 12,
        porcentaje_descuento: 0,
        base_gravable: 100.00,
        descripcion: "Producto de prueba desde API" // Nuevo campo requerido
      }],
      cobros: [{
        forma_cobro: "EFECTIVO",
        monto: 100.00,
        numero_cheque: "",
        tipo_ping: ""
      }]
    };

    console.log('📋 Documento a enviar a Contifico:');
    console.log(JSON.stringify(ventaDoc, null, 2));
    
    // Validar que no haya valores null/undefined en el documento
    const validateDocument = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (value === null || value === undefined) {
          console.log(`❌ Valor null/undefined encontrado en: ${currentPath}`);
          return false;
        }
        
        if (typeof value === 'object' && value !== null) {
          if (!validateDocument(value, currentPath)) {
            return false;
          }
        }
      }
      return true;
    };
    
    if (!validateDocument(ventaDoc)) {
      console.log('❌ Documento contiene valores null/undefined');
      return res.status(400).send({ error: 'Documento contiene valores inválidos' });
    }

    const response = await axios.post(`${CONTIFICO_API}/documento/`, ventaDoc, {
      headers: {
        'Authorization': CONTIFICO_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 segundos timeout
    });

    console.log('✅ Documento registrado en Contifico:', response.data);
    res.status(200).send({ 
      success: true, 
      contifico_id: response.data.id,
      shopify_order_id: order.id 
    });

  } catch (error) {
    console.error("❌ Error al procesar webhook:");
    
    if (error.response) {
      console.error("Error de Contifico:", error.response.status, error.response.data);
      res.status(500).send({ 
        error: 'Error de Contifico', 
        details: error.response.data,
        shopify_order_id: req.body.id 
      });
    } else if (error.request) {
      console.error("Error de red:", error.message);
      res.status(500).send({ 
        error: 'Error de conexión con Contifico',
        shopify_order_id: req.body.id 
      });
    } else {
      console.error("Error interno:", error.message);
      res.status(500).send({ 
        error: 'Error interno del servidor',
        shopify_order_id: req.body.id 
      });
    }
  }
});

// Endpoint de prueba para verificar conexión con Contifico
app.get('/test-contifico', async (req, res) => {
  try {
    console.log('🧪 Probando conexión con Contifico...');
    console.log('🔑 Token:', CONTIFICO_TOKEN);
    console.log('🔗 API URL:', CONTIFICO_API);
    
    const response = await axios.get(`${CONTIFICO_API}/empresa/`, {
      headers: {
        'Authorization': CONTIFICO_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Conexión exitosa:', response.data);
    res.json({ success: true, empresa: response.data });
  } catch (error) {
    console.error('❌ Error en test-contifico:', error.response?.status, error.response?.data);
    res.status(500).json({ 
      error: 'Error conectando con Contifico', 
      status: error.response?.status,
      details: error.response?.data || error.message 
    });
  }
});

// Endpoint adicional para probar diferentes métodos de autenticación
app.get('/test-auth', async (req, res) => {
  try {
    console.log('🧪 Probando diferentes métodos de autenticación...');
    
    // Probar con Token
    try {
      const tokenResponse = await axios.get(`${CONTIFICO_API}/empresa/`, {
        headers: {
          'Authorization': CONTIFICO_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Token auth exitoso');
      return res.json({ 
        success: true, 
        method: 'Token',
        empresa: tokenResponse.data 
      });
    } catch (tokenError) {
      console.log('❌ Token auth falló:', tokenError.response?.status);
    }
    
    // Probar con ApiKey (SECRETKEY format)
    try {
      const apiKeyResponse = await axios.get(`${CONTIFICO_API}/empresa/`, {
        headers: {
          'Authorization': CONTIFICO_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ ApiKey auth exitoso');
      return res.json({ 
        success: true, 
        method: 'ApiKey',
        empresa: apiKeyResponse.data 
      });
    } catch (apiKeyError) {
      console.log('❌ ApiKey auth falló:', apiKeyError.response?.status);
    }
    
    res.status(500).json({ 
      error: 'Ambos métodos de autenticación fallaron',
      token_error: 'Token authentication failed',
      apikey_error: 'ApiKey authentication failed'
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Error en test de autenticación', 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
  console.log(`📝 Webhook URL: ${WEBHOOK_URL}`);
  console.log(`🧪 Test Contifico: http://localhost:${PORT}/test-contifico`);
  console.log(`🔧 Test Auth: http://localhost:${PORT}/test-auth`);
  console.log(`🔗 Tu webhook está configurado en Shopify para: ${WEBHOOK_URL}`);
  console.log(`⚠️  HMAC verification deshabilitado para simplificar la integración`);
});