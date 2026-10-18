document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  // Dirección de tu API. Si usas un Dev Tunnel "Persistent", pega aquí su URL completa
  // (termina en /api/optimizer/calcular) para que funcione en cualquier dispositivo,
  // celular incluido, sin tener que configurarla en cada navegador.
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

  // Todo texto que viene de la API o del usuario se escapa antes de ir a innerHTML.
  const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const formatCLP = (monto) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0
  }).format(Number(monto) || 0);

  const formatGramos = (g) => {
    const n = Number(g) || 0;
    return n >= 1000
      ? `${(n / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kg`
      : `${Math.round(n)} g`;
  };

  let apiUrl = leerGuardado() || API_POR_DEFECTO;
  urlApiInput.value = apiUrl;

  // ---------------------------------------------------------------------------
  // Ejemplos rápidos y modal de configuración
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.btn-ejemplo').forEach((btn) => {
    btn.addEventListener('click', () => {
      textoPauta.value = btn.getAttribute('data-pauta');
    });
  });

  btnConfigApi.addEventListener('click', () => {
    modalApi.classList.remove('hidden');
    modalApi.classList.add('flex');
  });
  const cerrarModal = () => {
    modalApi.classList.add('hidden');
    modalApi.classList.remove('flex');
  };
  btnCerrarModal.addEventListener('click', cerrarModal);
  btnGuardarApi.addEventListener('click', () => {
    apiUrl = urlApiInput.value.trim() || API_POR_DEFECTO;
    guardar(apiUrl);
    cerrarModal();
    alert('URL de la API guardada correctamente.');
  });

  // ---------------------------------------------------------------------------
  // OCR: foto de la pauta -> texto (Tesseract.js, se carga solo cuando se usa)
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

  // Las fotos de celular pesan mucho: se reducen antes de leerlas (más rápido y gasta menos memoria).
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
      mostrarOcr('Cargando el lector de texto… (la primera vez puede tardar un poco)');
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
        mostrarOcr('No pudimos leer texto en la imagen. Prueba con más luz o más cerca, o escribe la pauta a mano.', 'error');
        return;
      }
      textoPauta.value = texto;
      mostrarOcr('Listo. Revisa y corrige el texto antes de calcular: la lectura automática puede equivocarse.', 'ok');
    } catch (err) {
      console.error('Error de OCR:', err);
      mostrarOcr('No pudimos leer la imagen. Escribe la pauta a mano o intenta de nuevo.', 'error');
    } finally {
      if (worker) { try { await worker.terminate(); } catch { /* nada */ } }
    }
  }

  [inputCamara, inputArchivo].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const archivo = e.target.files && e.target.files[0];
      await leerImagen(archivo);
      e.target.value = ''; // permite volver a elegir la misma foto
    });
  });

  // ---------------------------------------------------------------------------
  // Optimización
  // ---------------------------------------------------------------------------
  btnOptimizar.addEventListener('click', async () => {
    const pauta = textoPauta.value.trim();
    const pres = parseFloat(presupuesto.value);
    const nDias = dias ? parseInt(dias.value, 10) : 1;

    if (!pauta || pauta.length < 3) {
      alert('Por favor ingresa una pauta nutricional válida.');
      return;
    }
    if (!pres || pres <= 0) {
      alert('Ingresa un presupuesto máximo válido en CLP.');
      return;
    }
    if (!nDias || nDias < 1 || nDias > 31) {
      alert('Los días de la compra deben estar entre 1 y 31.');
      return;
    }

    contenedorResultados.innerHTML = `
      <div class="flex flex-col items-center py-12">
        <div class="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-sm font-bold text-gray-700">Calculando la canasta óptima en tu backend C#...</p>
      </div>
    `;

    const payload = {
      textoPauta: pauta,
      sinSelloSodio: chkSodio.checked,
      sinSelloAzucar: chkAzucar.checked,
      presupuestoMaximo: pres,
      dias: nDias
    };

    btnOptimizar.disabled = true;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

    try {
      let respuesta;
      try {
        respuesta = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  // ---------------------------------------------------------------------------
  // Errores
  // ---------------------------------------------------------------------------
  function mostrarCajaError(titulo, detalleHtml) {
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
       <p class="text-xs text-gray-600">Asegúrate de que Visual Studio esté corriendo (F5), de que el túnel esté activo y de que la política CORS esté habilitada.</p>`
    );
  }

  function mostrarErrorApi(estado, cuerpo) {
    const codigo = cuerpo && cuerpo.codigo;
    const detalle = (texto) => `<p class="text-xs text-gray-600">${esc(texto)}</p>`;

    if (estado === 422 && codigo === 'PAUTA_NO_RECONOCIDA') {
      const no = (cuerpo.alimentosNoReconocidos || []).map(esc).join(', ');
      mostrarCajaError(
        'No pudimos identificar ningún alimento en tu pauta',
        detalle('Prueba con un formato como: 150g de pollo, 100g de arroz, 2 huevos y 1 lechuga.') +
        (no ? `<p class="text-xs text-gray-500">No reconocimos: ${no}</p>` : '')
      );
      return;
    }
    if (estado === 400 && cuerpo && cuerpo.errors) {
      const mensajes = Object.values(cuerpo.errors).flat().map(esc).join(' ');
      mostrarCajaError('Revisa los datos ingresados', detalle(mensajes || 'La API rechazó la solicitud.'));
      return;
    }
    if (estado === 404 && codigo === 'RETAILER_DESCONOCIDO') {
      mostrarCajaError('Ese comercio no está configurado en la API', detalle(cuerpo.mensaje || ''));
      return;
    }
    if (estado === 429) {
      mostrarCajaError('Demasiadas solicitudes seguidas', detalle('Espera un minuto e inténtalo de nuevo.'));
      return;
    }
    mostrarCajaError(`La API respondió con un error (HTTP ${estado})`, detalle('Revisa la ventana de salida de Visual Studio para ver el detalle.'));
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
      icono: '⛔', titulo: 'Tu presupuesto no alcanza para ningún producto de la pauta',
      clases: 'bg-red-50 border-red-200 text-red-800'
    }
  };

  function renderizarResultados(data, presMax) {
    const items = data.productosSeleccionados || data.productos || [];
    const costoTotal = Number(data.costoTotal) || 0;
    const saldo = data.saldoDiferencia !== undefined ? Number(data.saldoDiferencia) : presMax - costoTotal;
    const nDias = Number(data.dias) || 1;
    const sinCubrir = data.requerimientosSinCubrir || [];
    const notas = data.notasAjuste || [];
    const noReconocidos = data.alimentosNoReconocidos || [];

    const proteinas = items.reduce((a, i) => a + (Number(i.proteinasAportadas) || 0), 0);
    const carbos = items.reduce((a, i) => a + (Number(i.carbohidratosAportados) || 0), 0);

    const filas = items.map((it) => {
      const envases = Number(it.envases) || 1;
      const pct = it.porcentajeCobertura !== undefined ? Number(it.porcentajeCobertura) : 100;
      const parcial = pct < 100;
      const sellos = [it.selloSodio ? 'ALTO EN SODIO' : '', it.selloAzucar ? 'ALTO EN AZÚCARES' : '']
        .filter(Boolean)
        .map((s) => `<span class="inline-block bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-1">${s}</span>`)
        .join('');
      const rescate = it.esRescate
        ? '<span class="inline-block bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">Mejor opción disponible</span>'
        : '';
      const cobertura = it.gramosRequeridos !== undefined
        ? `<div class="text-[11px] ${parcial ? 'text-amber-600 font-semibold' : 'text-gray-400'}">Cubre ${formatGramos(it.gramosCubiertos)} de ${formatGramos(it.gramosRequeridos)}${parcial ? ` (${Math.round(pct)}%)` : ''}</div>`
        : '';

      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50/50">
          <td class="py-3 px-4 text-left font-medium text-gray-800 text-xs">
            ${esc(it.nombre)}
            <div class="mt-1">${sellos}${rescate}</div>
            ${cobertura}
          </td>
          <td class="py-3 px-4 text-center text-xs text-gray-600">${envases} ${envases === 1 ? 'envase' : 'envases'}</td>
          <td class="py-3 px-4 text-right text-xs text-gray-600">${formatCLP(it.precio)}</td>
          <td class="py-3 px-4 text-right font-bold text-xs text-gray-900">${formatCLP(it.subtotal !== undefined ? it.subtotal : (Number(it.precio) || 0) * envases)}</td>
        </tr>`;
    }).join('') || `
        <tr><td colspan="4" class="py-6 px-4 text-center text-xs text-gray-500">No se pudo armar ninguna compra con este presupuesto.</td></tr>`;

    const estado = ESTADOS[data.estado];
    const banner = estado
      ? `<div class="p-3 border rounded-xl text-xs font-semibold ${estado.clases}">${estado.icono} ${estado.titulo}</div>`
      : '';

    const listaNotas = notas.length
      ? `<ul class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 list-disc list-inside">${notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
      : '';
    const avisoSinCubrir = sinCubrir.length
      ? `<p class="text-xs text-red-700"><strong>Sin cubrir:</strong> ${sinCubrir.map(esc).join(', ')}</p>`
      : '';
    const avisoNoReconocidos = noReconocidos.length
      ? `<p class="text-xs text-gray-500">No reconocimos: ${noReconocidos.map(esc).join(', ')}. Prueba escribiéndolo de otra forma.</p>`
      : '';

    contenedorResultados.innerHTML = `
      <div class="w-full text-left space-y-5">
        <div class="flex justify-between items-center pb-4 border-b border-gray-200">
          <div>
            <h3 class="text-xl font-extrabold text-gray-900">Canasta Recomendada</h3>
            <p class="text-xs text-gray-500">Seleccionada según tu presupuesto y restricciones de Ley 20.606${nDias > 1 ? ` · compra para ${nDias} días` : ''}</p>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black text-brand-700">${formatCLP(costoTotal)}</span>
            <span class="block text-[11px] text-gray-500">${saldo >= 0 ? 'Saldo a favor' : 'Excedido'}: ${formatCLP(Math.abs(saldo))}</span>
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

        ${items.length ? `<p class="text-[11px] text-gray-500">Aporte estimado de lo que consumes: ${proteinas.toLocaleString('es-CL', { maximumFractionDigits: 1 })} g de proteínas · ${carbos.toLocaleString('es-CL', { maximumFractionDigits: 1 })} g de carbohidratos</p>` : ''}
        ${avisoSinCubrir}
        ${listaNotas}
        ${avisoNoReconocidos}
      </div>
    `;
  }
});
      </div>
    `;
  }
});
