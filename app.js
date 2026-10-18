document.addEventListener('DOMContentLoaded', () => {
  // Elementos DOM
  const textoPauta = document.getElementById('textoPauta');
  const chkSodio = document.getElementById('chkSodio');
  const chkAzucar = document.getElementById('chkAzucar');
  const presupuesto = document.getElementById('presupuesto');
  const btnOptimizar = document.getElementById('btnOptimizar');
  const contenedorResultados = document.getElementById('contenedorResultados');
  const btnConfigApi = document.getElementById('btnConfigApi');
  const modalApi = document.getElementById('modalApi');
  const btnCerrarModal = document.getElementById('btnCerrarModal');
  const btnGuardarApi = document.getElementById('btnGuardarApi');
  const urlApiInput = document.getElementById('urlApi');

  // URL API guardada o por defecto
  let apiUrl = localStorage.getItem('calcudiett_api_url') || 'https://localhost:44388/api/optimizer/calcular';
  urlApiInput.value = apiUrl;

  // Botones de ejemplos rápidos
  document.querySelectorAll('.btn-ejemplo').forEach(btn => {
    btn.addEventListener('click', () => {
      textoPauta.value = btn.getAttribute('data-pauta');
    });
  });

  // Modal API
  btnConfigApi.addEventListener('click', () => modalApi.classList.remove('hidden'));
  btnCerrarModal.addEventListener('click', () => modalApi.classList.add('hidden'));
  btnGuardarApi.addEventListener('click', () => {
    apiUrl = urlApiInput.value.trim();
    localStorage.setItem('calcudiett_api_url', apiUrl);
    modalApi.classList.add('hidden');
    alert('URL de la API guardada correctamente.');
  });

  // Formateador CLP
  const formatCLP = (monto) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(monto);
  };

  // Función principal de Optimización
  btnOptimizar.addEventListener('click', async () => {
    const pauta = textoPauta.value.trim();
    const pres = parseFloat(presupuesto.value);

    if (!pauta || pauta.length < 3) {
      alert('Por favor ingresa una pauta nutricional válida.');
      return;
    }

    if (!pres || pres <= 0) {
      alert('Ingresa un presupuesto máximo válido en CLP.');
      return;
    }

    // Loader
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
      presupuestoMaximo: pres
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();
      renderizarResultados(data, pres);

    } catch (err) {
      console.error('Error al conectar con la API:', err);
      contenedorResultados.innerHTML = `
        <div class="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p class="text-sm font-bold text-red-700">No pudimos conectarnos con tu API C#</p>
          <p class="text-xs text-red-600 font-mono">${apiUrl}</p>
          <p class="text-xs text-gray-600">Asegúrate de que Visual Studio esté corriendo (F5) y que la política CORS esté habilitada.</p>
        </div>
      `;
    }
  });

  // Renderizar la respuesta del Motor de C#
  function renderizarResultados(data, presMax) {
    const productos = data.productos || data.Canasta || [];
    const costoTotal = data.costoTotal || data.CostoTotal || 0;
    const saldo = presMax - costoTotal;

    let htmlProductos = productos.map(item => `
      <tr class="border-b border-gray-100 hover:bg-gray-50/50">
        <td class="py-3 px-4 text-left font-medium text-gray-800 text-xs">${item.nombre || item.Nombre}</td>
        <td class="py-3 px-4 text-center text-xs text-gray-600">${item.cantidad || item.Cantidad || 1}</td>
        <td class="py-3 px-4 text-right font-bold text-xs text-gray-900">${formatCLP(item.precio || item.Precio)}</td>
      </tr>
    `).join('');

    contenedorResultados.innerHTML = `
      <div class="w-full text-left space-y-6">
        <div class="flex justify-between items-center pb-4 border-b border-gray-200">
          <div>
            <h3 class="text-xl font-extrabold text-gray-900">Canasta Recomendada</h3>
            <p class="text-xs text-gray-500">Seleccionada según tu presupuesto y restricciones de Ley 20.606</p>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black text-brand-700">${formatCLP(costoTotal)}</span>
            <span class="block text-[11px] text-gray-500">Saldo a favor: ${formatCLP(saldo)}</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th class="py-2.5 px-4">Producto</th>
                <th class="py-2.5 px-4 text-center">Cantidad</th>
                <th class="py-2.5 px-4 text-right">Precio Envase</th>
              </tr>
            </thead>
            <tbody>
              ${htmlProductos}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
});