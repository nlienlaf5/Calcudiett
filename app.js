document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  const API_POR_DEFECTO = 'https://localhost:44388/api/optimizer/calcular';
  const CLAVE_API = 'calcudiett_api_url';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const TIEMPO_MAXIMO_MS = 20000;

  // ---------------------------------------------------------------------------
  // Elementos DOM
  // ---------------------------------------------------------------------------
  const textoPauta = document.getElementById('textoPauta');
  const chkSodio = document.getElementById('chkSodio');
  const chkAzucar = document.getElementById('chkAzucar');
  const presupuesto = document.getElementById('presupuesto');
  const dias = document.getElementById('dias');
  const btnOptimizar = document.getElementById('btnOptimizar');
  const contenedorResultados = document.getElementById('contenedorResultados');
  const btnConfigApi = document.getElementById('btnConfigApi');
  const modalApi = document.getElementById('modalApi');
  const btnCerrarModal = document.getElementById('btnCerrarModal');
  const btnGuardarApi = document.getElementById('btnGuardarApi');
  const urlApiInput = document.getElementById('urlApi');
  const inputCamara = document.getElementById('inputCamara');
  const inputArchivo = document.getElementById('inputArchivo');
  const ocrEstado = document.getElementById('ocrEstado');

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const leerGuardado = () => { try { return localStorage.getItem(CLAVE_API); } catch { return null; } };
  const guardar = (valor) => { try { localStorage.setItem(CLAVE_API, valor); } catch { /* sin almacenamiento */ } };

  const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const formatCLP = (monto) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0
  }).format(Number(monto) || 0);

  let apiUrl = leerGuardado() || API_POR_DEFECTO;
  if (urlApiInput) urlApiInput.value = apiUrl;

  // ---------------------------------------------------------------------------
  // Ejemplos rápidos y modal de configuración
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.btn-ejemplo').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (textoPauta) textoPauta.value = btn.getAttribute('data-pauta');
    });
  });

  if (btnConfigApi && modalApi) {
    btnConfigApi.addEventListener('click', () => {
      modalApi.classList.remove('hidden');
      modalApi.classList.add('flex');
    });
  }

  const cerrarModal = () => {
    if (modalApi) {
      modalApi.classList.add('hidden');
      modalApi.classList.remove('flex');
    }
  };

  if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);

  if (btnGuardarApi) {
    btnGuardarApi.addEventListener('click', () => {
      if (urlApiInput) {
        apiUrl = urlApiInput.value.trim() || API_POR_DEFECTO;
        guardar(apiUrl);
      }
      cerrarModal();
      alert('URL de la API guardada correctamente.');
    });
  }

  // ---------------------------------------------------------------------------
  // OCR: foto de la pauta -> texto
  // ---------------------------------------------------------------------------
  let cargaTesseract = null;
  function cargarTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!cargaTesseract) {
      cargaTesseract = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = resolve;
        s.onerror = () => { cargaTesseract = null; reject(new Error('No se pudo cargar el lector de texto.')); };
        document.head.appendChild(s);
      });
    }
    return cargaTesseract;
  }

  function mostrarOcr(mensaje, tipo = 'info') {
    if (!ocrEstado) return;
    const colores = { info: 'text-gray-600', ok: 'text-green-700', error: 'text-red-600' };
    ocrEstado.className = `text-xs font-medium ${colores[tipo] || colores.info}`;
    ocrEstado.textContent = mensaje;
  }

  async function prepararImagen(archivo, ladoMax = 1800) {
    try {
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * escala));
      canvas.height = Math.max(1, Math.round(bmp.height * escala));
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      return canvas;
    } catch {
      return archivo;
    }
  }

  function limpiarTextoOcr(texto) {
    return String(texto || '')
      .split('\n')
      .map((linea) => linea.replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((linea) => /[a-záéíóúñ0-9]/i.test(linea))
      .join('\n');
  }

  async function leerImagen(archivo) {
    if (!archivo) return;
    let worker = null;
    try {
      mostrarOcr('Cargando el lector de texto…');
      await cargarTesseract();
      mostrarOcr('Preparando la imagen…');
      const imagen = await prepararImagen(archivo);
      worker = await window.Tesseract.createWorker('spa', 1, {
        logger: (m) => {
          if (m && m.status === 'recognizing text') {
            mostrarOcr(`Leyendo la imagen… ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      });
      const resultado = await worker.recognize(imagen);
      const texto = limpiarTextoOcr(resultado && resultado.data && resultado.data.text);
      if (!texto) {
        mostrarOcr('No pudimos leer texto en la imagen. Prueba escribiéndola a mano.', 'error');
        return;
      }
      if (textoPauta) textoPauta.value = texto;
      mostrarOcr('Listo. Revisa el texto antes de calcular.', 'ok');
    } catch (err) {
      console.error('Error de OCR:', err);
      mostrarOcr('No pudimos leer la imagen.', 'error');
    } finally {
      if (worker) { try { await worker.terminate(); } catch { /* nada */ } }
    }
  }

  [inputCamara, inputArchivo].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const archivo = e.target.files && e.target.files[0];
      await leerImagen(archivo);
      e.target.value = '';
    });
  });

  // ---------------------------------------------------------------------------
  // Optimización
  // ---------------------------------------------------------------------------
  if (btnOptimizar) {
    btnOptimizar.addEventListener('click', async () => {
      const pauta = textoPauta ? textoPauta.value.trim() : '';
      const pres = presupuesto ? parseFloat(presupuesto.value) : 0;
      const nDias = dias ? parseInt(dias.value, 10) : 1;

      if (!pauta || pauta.length < 3) {
        alert('Por favor ingresa una pauta nutricional válida.');
        return;
      }
      if (!pres || pres <= 0) {
        alert('Ingresa un presupuesto máximo válido en CLP.');
        return;
      }

      if (contenedorResultados) {
        contenedorResultados.innerHTML = `
          <div class="flex flex-col items-center py-12">
            <div class="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p class="text-sm font-bold text-gray-700">Calculando la canasta óptima en tu backend C#...</p>
          </div>
        `;
      }

      const payload = {
        TextoPauta: pauta,
        SinSelloSodio: chkSodio ? chkSodio.checked : false,
        SinSelloAzucar: chkAzucar ? chkAzucar.checked : false,
        PresupuestoMaximo: pres,
        Dias: nDias
      };

      btnOptimizar.disabled = true;
      const controlador = new AbortController();
      const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

      try {
        let respuesta;
        try {
          respuesta = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Tunnel-Skip-AntiPhishing-Page': 'true'
            },
            body: JSON.stringify(payload),
            signal: controlador.signal
          });
        } catch (err) {
          console.error('Error al conectar con la API:', err);
          mostrarErrorConexion(err && err.name === 'AbortError');
          return;
        }

        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
          mostrarErrorApi(respuesta.status, cuerpo);
          return;
        }
        renderizarResultados(cuerpo || {}, pres);
      } finally {
        clearTimeout(temporizador);
        btnOptimizar.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Errores
  // ---------------------------------------------------------------------------
  function mostrarCajaError(titulo, detalleHtml) {
    if (!contenedorResultados) return;
    contenedorResultados.innerHTML = `
      <div class="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
        <p class="text-sm font-bold text-red-700">${esc(titulo)}</p>
        ${detalleHtml}
      </div>
    `;
  }

  function mostrarErrorConexion(porTiempo) {
    mostrarCajaError(
      porTiempo ? 'Tu API tardó demasiado en responder' : 'No pudimos conectarnos con tu API C#',
      `<p class="text-xs text-red-600 font-mono break-all">${esc(apiUrl)}</p>
       <p class="text-xs text-gray-600">Asegúrate de que Visual Studio esté corriendo y que el túnel esté activo.</p>`
    );
  }

  function mostrarErrorApi(estado, cuerpo) {
    const detalle = (texto) => `<p class="text-xs text-gray-600">${esc(texto)}</p>`;
    mostrarCajaError(`Error de API (HTTP ${estado})`, detalle('Revisa la consola de Visual Studio.'));
  }

  // ---------------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------------
  const ESTADOS = {
    CANASTA_COMPLETA: {
      icono: '✅', titulo: 'Canasta completa: tu presupuesto alcanza para todo',
      clases: 'bg-green-50 border-green-200 text-green-800'
    },
    COBERTURA_PARCIAL: {
      icono: '⚠️', titulo: 'Cobertura parcial: tu presupuesto no alcanza para todo',
      clases: 'bg-amber-50 border-amber-200 text-amber-800'
    },
    PRESUPUESTO_INSUFICIENTE: {
      icono: '⛔', titulo: 'Tu presupuesto no alcanza para ningún producto',
      clases: 'bg-red-50 border-red-200 text-red-800'
    }
  };

  function renderizarResultados(data, presMax) {
    if (!contenedorResultados) return;

    const items = data.productosSeleccionados || data.ProductosSeleccionados || data.productos || [];
    const costoTotal = Number(data.costoTotal || data.CostoTotal) || 0;
    const saldo = data.saldoDiferencia !== undefined ? Number(data.saldoDiferencia) : (data.SaldoDiferencia !== undefined ? Number(data.SaldoDiferencia) : presMax - costoTotal);
    const nDias = Number(data.dias || data.Dias) || 1;

    const filas = items.map((it) => {
      const nombre = it.nombre || it.Nombre || 'Producto';
      const categoria = it.categoria || it.Categoria || '';
      const envases = Number(it.envases || it.Envases) || 1;
      const precioUnitario = Number(it.precio || it.Precio) || 0;
      const subtotal = Number(it.subtotal || it.Subtotal) || (precioUnitario * envases);
      
      const sodio = it.selloSodio !== undefined ? it.selloSodio : it.SelloSodio;
      const azucar = it.selloAzucar !== undefined ? it.selloAzucar : it.SelloAzucar;

      const sellos = [sodio ? 'ALTO EN SODIO' : '', azucar ? 'ALTO EN AZÚCARES' : '']
        .filter(Boolean)
        .map((s) => `<span class="inline-block bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-1">${s}</span>`)
        .join('');

      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50/50">
          <td class="py-3 px-4 text-left font-medium text-gray-800 text-xs">
            <div class="font-bold text-gray-900">${esc(nombre)}</div>
            ${categoria ? `<div class="text-[10px] text-gray-400">${esc(categoria)}</div>` : ''}
            <div class="mt-1">${sellos}</div>
          </td>
          <td class="py-3 px-4 text-center text-xs text-gray-600">${envases} ${envases === 1 ? 'envase' : 'envases'}</td>
          <td class="py-3 px-4 text-right text-xs text-gray-600">${formatCLP(precioUnitario)}</td>
          <td class="py-3 px-4 text-right font-bold text-xs text-gray-900">${formatCLP(subtotal)}</td>
        </tr>`;
    }).join('') || `
        <tr><td colspan="4" class="py-6 px-4 text-center text-xs text-gray-500">No se pudo armar ninguna compra con este presupuesto.</td></tr>`;

    const estadoKey = data.estado || data.Estado;
    const estado = ESTADOS[estadoKey];
    const banner = estado
      ? `<div class="p-3 border rounded-xl text-xs font-semibold ${estado.clases}">${estado.icono} ${estado.titulo}</div>`
      : '';

    contenedorResultados.innerHTML = `
      <div class="w-full text-left space-y-5">
        <div class="flex justify-between items-center pb-4 border-b border-gray-200">
          <div>
            <h3 class="text-xl font-extrabold text-gray-900">Canasta Recomendada</h3>
            <p class="text-xs text-gray-500">Seleccionada según tu presupuesto y restricciones Ley 20.606${nDias > 1 ? ` · compra para ${nDias} días` : ''}</p>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black text-brand-700">${formatCLP(costoTotal)}</span>
            <span class="block text-[11px] ${saldo >= 0 ? 'text-green-600' : 'text-red-600'} font-medium">
              ${saldo >= 0 ? 'Saldo a favor' : 'Excedido'}: ${formatCLP(Math.abs(saldo))}
            </span>
          </div>
        </div>

        ${banner}

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th class="py-2.5 px-4">Producto</th>
                <th class="py-2.5 px-4 text-center">Cantidad</th>
                <th class="py-2.5 px-4 text-right">Precio envase</th>
                <th class="py-2.5 px-4 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${filas}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
});
