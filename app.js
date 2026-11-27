const SUPABASE_URL = "https://dousxjmfxyrlepsjnmpd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yFgwE7iPDgZbtAI-NY7gVA_YoxE1Bf7";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = "hemocloud_sesion_activa";

const sesionRaw = sessionStorage.getItem(SESSION_KEY);
let sesionActiva = null;
try {
  sesionActiva = sesionRaw ? JSON.parse(sesionRaw) : null;
} catch (_) {
  sesionActiva = null;
}

if (!sesionActiva) {
  window.location.href = "login.html";
}

const rolActual = sesionActiva?.rol || "Coordinador de Banco de Sangre";
const puedeEliminarStock = rolActual === "Administrador de Red";
const puedeCrearCampana =
  rolActual === "Administrador de Red" || rolActual === "Coordinador de Banco de Sangre";

const usuarioActivoLabel = document.getElementById("usuarioActivoLabel");
if (usuarioActivoLabel && sesionActiva) {
  usuarioActivoLabel.textContent = `${sesionActiva.nombre} · ${rolActual}`;
}

const btnCerrarSesion = document.getElementById("btnCerrarSesion");
if (btnCerrarSesion) {
  btnCerrarSesion.addEventListener("click", async () => {
    try {
      await db.auth.signOut();
    } catch (_) {}
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  });
}

const formStock = document.getElementById("formStock");
const tablaStock = document.getElementById("tablaStock");
const filtroGrupo = document.getElementById("filtroGrupo");
const formDonante = document.getElementById("formDonante");
const btnVerDonantes = document.getElementById("btnVerDonantes");
const btnRefrescarDonantes = document.getElementById("btnRefrescarDonantes");
const contenedorListaDonantes = document.getElementById("contenedorListaDonantes");
const tablaDonantes = document.getElementById("tablaDonantes");
const totalDonantesBadge = document.getElementById("totalDonantesBadge");

const formSolicitudUrgente = document.getElementById("formSolicitudUrgente");
const tablaSolicitudes = document.getElementById("tablaSolicitudes");
const tablaDonacionesHist = document.getElementById("tablaDonacionesHist");
const formCampana = document.getElementById("formCampana");
const tablaCampanas = document.getElementById("tablaCampanas");
const tablaAuditoria = document.getElementById("tablaAuditoria");
const tablaPersonal = document.getElementById("tablaPersonal");

const GRUPOS_VALIDOS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const REGEX_NOMBRE_PERSONA = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'.-]{3,80}$/;
const REGEX_TEXTO_LUGAR = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s.,#°()\/-]{3,100}$/;
const REGEX_TELEFONO = /^\+?\d{7,15}$/;

let stockActual = [];
let donantesActuales = [];
let listaDonantesVisible = false;
let conteoDonacionesHist = 0;
let conteoCampanas = 0;

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarTexto(texto) {
  return String(texto || "").trim().replace(/\s+/g, " ");
}

function validarEnteroEnRango(raw, min, max) {
  const limpio = String(raw ?? "").trim();
  if (!/^\d+$/.test(limpio)) return null;
  const num = Number(limpio);
  if (!Number.isInteger(num) || num < min || num > max) return null;
  return num;
}

function obtenerInsigniaPorTotal(total) {
  const n = Number(total || 0);
  if (n >= 5) return "Nivel 5+ Donaciones (Héroe)";
  if (n === 1) return "Primera Donación";
  return "Donante Activo";
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const targetId = btn.getAttribute("data-tab");
    document.getElementById(targetId).classList.add("active");

    if (targetId === "tab-urgentes") cargarSolicitudes();
    if (targetId === "tab-historial") {
      cargarDonacionesHistorial();
      cargarCampanas();
    }
    if (targetId === "tab-auditoria") {
      cargarAuditoria();
      cargarPersonal();
    }
  });
});

function mostrarMensaje(contenedorId, texto, tipo = "error") {
  let caja = document.getElementById(contenedorId);
  if (!caja) {
    caja = document.createElement("div");
    caja.id = contenedorId;
    const destino =
      contenedorId === "msgStock" ? formStock :
      contenedorId === "msgUrgente" ? formSolicitudUrgente :
      contenedorId === "msgCampana" ? formCampana :
      formDonante;
    destino.parentNode.insertBefore(caja, destino);
  }

  caja.className = `alerta-feedback ${tipo === "ok" ? "alerta-ok" : "alerta-error"}`;
  caja.innerHTML = `<i class="bi ${tipo === "ok" ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"}"></i> <span>${escaparHtml(texto)}</span>`;
  caja.style.display = "flex";

  clearTimeout(caja._timer);
  caja._timer = setTimeout(() => {
    caja.style.display = "none";
  }, 4500);
}

function actualizarKpiDonacionesCampanas() {
  const el = document.getElementById("statDonacionesCount");
  if (el) {
    el.textContent = `${conteoDonacionesHist} / ${conteoCampanas}`;
  }
}

async function registrarAuditoria(tipoMovimiento, grupo, cambioUnidades, detalle) {
  const actor = sesionActiva ? `${sesionActiva.nombre} (${rolActual})` : rolActual;
  await db.from("auditoria_movimientos").insert([{
    tipo_movimiento: tipoMovimiento,
    grupo_sanguineo: grupo,
    cambio_unidades: cambioUnidades,
    detalle: `${detalle} · Por: ${actor}`,
    activo: true
  }]);
}

async function cargarStock() {
  const { data, error } = await db
    .from("stock_sangre")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: true });

  if (error) {
    mostrarMensaje("msgStock", "Error al leer stock: " + error.message, "error");
    return;
  }

  stockActual = Array.isArray(data) ? data : [];

  const totalRegistros = stockActual.length;
  const totalUnidades = stockActual.reduce((acc, item) => acc + Number(item.unidades || 0), 0);

  document.getElementById("statCentros").textContent = totalRegistros;
  document.getElementById("statUnidades").textContent = `${totalUnidades} unid.`;

  const filtrados = filtroGrupo.value === "TODOS"
    ? stockActual
    : stockActual.filter((item) => item.grupo_sanguineo === filtroGrupo.value);

  tablaStock.innerHTML = "";
  if (filtrados.length === 0) {
    tablaStock.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#64748b; padding:2rem;">
          No hay registros activos de stock para el filtro seleccionado.
        </td>
      </tr>
    `;
    return;
  }

  filtrados.forEach((item, idx) => {
    const mensajeWa = encodeURIComponent(
      `URGENTE - Cadena de donantes: Se necesita sangre grupo ${item.grupo_sanguineo} en ${item.centro_nombre} (${item.ciudad_o_zona}). Unidades actuales: ${item.unidades}. Si no puedes donar, reenvía este mensaje.`
    );
    const linkWa = `https://wa.me/?text=${mensajeWa}`;
    const porcentaje = Math.min(100, Math.round((Number(item.unidades) / 25) * 100));
    const claseBarra = Number(item.unidades) >= 5 ? "ok" : "";

    const botonEliminar = puedeEliminarStock
      ? `<button type="button" class="peligro" onclick="eliminarStock(${Number(item.id)})">
           <i class="bi bi-trash3-fill"></i> Dar de baja
         </button>`
      : `<button type="button" class="peligro" style="opacity:0.6;" title="Solo Administrador de Red" onclick="avisoSinPermisoEliminar()">
           <i class="bi bi-lock-fill"></i> Dar de baja
         </button>`;

    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td><span class="contador-pill">#${idx + 1}</span> <strong>${escaparHtml(item.centro_nombre)}</strong></td>
      <td>${escaparHtml(item.ciudad_o_zona)}${item.campana_activa ? " · <span style='color:#be123c;font-weight:600;'>" + escaparHtml(item.campana_activa) + "</span>" : ""}</td>
      <td><span class="badge">${escaparHtml(item.grupo_sanguineo)}</span></td>
      <td>
        <strong>${Number(item.unidades)}</strong> unid.
        <div class="stock-meter">
          <div class="stock-meter-fill ${claseBarra}" style="width:${porcentaje}%"></div>
        </div>
      </td>
      <td>
        <div class="acciones-grupo">
          <button type="button" class="secundario" onclick="prepararEdicionPorId(${Number(item.id)})">
            <i class="bi bi-pencil-square"></i> Editar
          </button>
          ${botonEliminar}
          <a href="${linkWa}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:inline-flex;">
            <button type="button" class="whatsapp">
              <i class="bi bi-whatsapp"></i> Avisar
            </button>
          </a>
        </div>
      </td>
    `;
    tablaStock.appendChild(fila);
  });
}

window.avisoSinPermisoEliminar = function avisoSinPermisoEliminar() {
  mostrarMensaje(
    "msgStock",
    `Tu rol actual (${rolActual}) no puede dar de baja registros de stock. Solo Administrador de Red puede realizar esta acción.`
  );
};

filtroGrupo.addEventListener("change", cargarStock);

window.cargarDonantes = async function cargarDonantes(forzarRender = false) {
  const { data, error } = await db
    .from("donantes")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: true });

  if (error) {
    mostrarMensaje("msgDonante", "Error al cargar donantes: " + error.message, "error");
    return;
  }

  donantesActuales = Array.isArray(data) ? data : [];
  if (totalDonantesBadge) {
    totalDonantesBadge.textContent = donantesActuales.length;
  }

  if (!listaDonantesVisible && !forzarRender) {
    return;
  }

  tablaDonantes.innerHTML = "";
  if (donantesActuales.length === 0) {
    tablaDonantes.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#64748b; padding:1.5rem;">
          Todavía no hay donantes activos registrados.
        </td>
      </tr>
    `;
    return;
  }

  donantesActuales.forEach((donante, idx) => {
    const insigniaMostrar = obtenerInsigniaPorTotal(donante.total_donaciones);
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td><strong>#${idx + 1}</strong> · ${escaparHtml(donante.nombre_completo)}</td>
      <td><span class="badge">${escaparHtml(donante.grupo_sanguineo)}</span></td>
      <td>${escaparHtml(donante.telefono_whatsapp)}</td>
      <td>
        <strong>${Number(donante.total_donaciones)}</strong> don.
        <div><span class="insignia-tag">${escaparHtml(insigniaMostrar)}</span></div>
      </td>
      <td class="nowrap-col">${escaparHtml(donante.proxima_fecha_disponible || "-")}</td>
    `;
    tablaDonantes.appendChild(fila);
  });
};

btnVerDonantes.addEventListener("click", async () => {
  listaDonantesVisible = !listaDonantesVisible;
  contenedorListaDonantes.style.display = listaDonantesVisible ? "block" : "none";
  btnRefrescarDonantes.style.display = listaDonantesVisible ? "inline-flex" : "none";
  btnVerDonantes.innerHTML = listaDonantesVisible
    ? '<i class="bi bi-eye-slash-fill"></i> Ocultar donantes'
    : '<i class="bi bi-eye-fill"></i> Mostrar donantes';

  if (listaDonantesVisible) {
    await cargarDonantes(true);
  }
});

// ==================== VALIDACIÓN Y GUARDADO DE STOCK ====================
formStock.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("stockId").value.trim();
  const centroNombre = normalizarTexto(document.getElementById("centroNombre").value);
  const zona = normalizarTexto(document.getElementById("zona").value);
  const grupo = document.getElementById("grupoStock").value;
  const unidades = validarEnteroEnRango(document.getElementById("unidades").value, 0, 10000);
  const campana = normalizarTexto(document.getElementById("campana").value);

  if (!REGEX_TEXTO_LUGAR.test(centroNombre)) {
    mostrarMensaje("msgStock", "El nombre del hospital o centro debe tener entre 3 y 100 caracteres válidos.");
    return;
  }

  if (zona.length < 3 || zona.length > 80 || !REGEX_TEXTO_LUGAR.test(zona)) {
    mostrarMensaje("msgStock", "La ciudad o zona debe tener entre 3 y 80 caracteres válidos.");
    return;
  }

  if (!GRUPOS_VALIDOS.includes(grupo)) {
    mostrarMensaje("msgStock", "Selecciona un grupo sanguíneo válido.");
    return;
  }

  if (unidades === null) {
    mostrarMensaje("msgStock", "Las unidades deben ser un número entero entre 0 y 10,000.");
    return;
  }

  if (campana && (campana.length < 3 || campana.length > 100)) {
    mostrarMensaje("msgStock", "El nombre de la campaña debe tener entre 3 y 100 caracteres.");
    return;
  }

  if (!id) {
    const yaExiste = stockActual.some(
      (s) =>
        normalizarTexto(s.centro_nombre).toLowerCase() === centroNombre.toLowerCase() &&
        s.grupo_sanguineo === grupo
    );
    if (yaExiste) {
      mostrarMensaje(
        "msgStock",
        `Ya existe un registro activo para ${centroNombre} con grupo ${grupo}. Usa "Editar" para actualizar sus unidades.`
      );
      return;
    }
  }

  const payload = {
    centro_nombre: centroNombre,
    ciudad_o_zona: zona,
    grupo_sanguineo: grupo,
    unidades,
    campana_activa: campana || null,
    activo: true
  };

  let respuesta;
  if (id) {
    respuesta = await db.from("stock_sangre").update(payload).eq("id", id);
  } else {
    respuesta = await db.from("stock_sangre").insert([payload]);
  }

  if (respuesta.error) {
    mostrarMensaje("msgStock", "Error al guardar: " + respuesta.error.message);
    return;
  }

  await registrarAuditoria(
    id ? "EDICION_STOCK" : "ALTA_STOCK",
    grupo,
    unidades,
    `${id ? "Actualizó" : "Registró"} ${unidades} unid. (${grupo}) en ${centroNombre}`
  );

  mostrarMensaje(
    "msgStock",
    id ? "Registro actualizado correctamente." : "Stock registrado exitosamente.",
    "ok"
  );
  resetearFormularioStock();
  cargarStock();
});

window.prepararEdicionPorId = function prepararEdicionPorId(id) {
  const item = stockActual.find((r) => Number(r.id) === Number(id));
  if (!item) return;

  document.getElementById("stockId").value = item.id;
  document.getElementById("centroNombre").value = item.centro_nombre || "";
  document.getElementById("zona").value = item.ciudad_o_zona || "";
  document.getElementById("grupoStock").value = item.grupo_sanguineo || "";
  document.getElementById("unidades").value = item.unidades ?? 0;
  document.getElementById("campana").value = item.campana_activa || "";
  document.getElementById("tituloFormStock").innerHTML =
    '<i class="bi bi-pencil-square"></i> Editar Stock por Centro';
  document.getElementById("btnGuardarStock").innerHTML =
    '<i class="bi bi-cloud-check-fill"></i> Actualizar Stock';
  document.getElementById("btnCancelarEdicion").style.display = "inline-flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

document.getElementById("btnCancelarEdicion").addEventListener("click", resetearFormularioStock);

function resetearFormularioStock() {
  formStock.reset();
  document.getElementById("stockId").value = "";
  document.getElementById("tituloFormStock").innerHTML =
    '<i class="bi bi-hospital-fill"></i> Inventario por Centro';
  document.getElementById("btnGuardarStock").innerHTML =
    '<i class="bi bi-cloud-upload-fill"></i> Guardar Stock';
  document.getElementById("btnCancelarEdicion").style.display = "none";
}

window.eliminarStock = async function eliminarStock(id) {
  if (!puedeEliminarStock) {
    avisoSinPermisoEliminar();
    return;
  }
  if (!confirm("¿Dar de baja lógicamente este registro de stock?")) return;
  const item = stockActual.find((r) => Number(r.id) === Number(id));

  const { error } = await db
    .from("stock_sangre")
    .update({ activo: false })
    .eq("id", id);

  if (error) {
    mostrarMensaje("msgStock", "Error al dar de baja: " + error.message);
    return;
  }

  await registrarAuditoria(
    "BAJA_LOGICA_STOCK",
    item ? item.grupo_sanguineo : "N/A",
    0,
    `Baja lógica de registro ID #${id}${item ? " (" + item.centro_nombre + ")" : ""}`
  );
  mostrarMensaje("msgStock", "Registro dado de baja lógicamente.", "ok");
  cargarStock();
};

async function incrementarStockPorGrupo(grupo) {
  const { data: existentes, error: errorConsulta } = await db
    .from("stock_sangre")
    .select("*")
    .eq("grupo_sanguineo", grupo)
    .eq("activo", true)
    .order("id", { ascending: false })
    .limit(1);

  if (errorConsulta) {
    throw new Error("No se pudo consultar el stock: " + errorConsulta.message);
  }

  if (existentes && existentes.length > 0) {
    const actual = existentes[0];
    const nuevasUnidades = Number(actual.unidades || 0) + 1;

    const { data: actualizado, error: errorUpdate } = await db
      .from("stock_sangre")
      .update({ unidades: nuevasUnidades })
      .eq("id", actual.id)
      .select()
      .single();

    if (errorUpdate) {
      throw new Error("No se pudo actualizar el stock: " + errorUpdate.message);
    }

    return actualizado;
  }

  const { data: creado, error: errorInsert } = await db
    .from("stock_sangre")
    .insert([{
      centro_nombre: "Banco Central de Sangre",
      ciudad_o_zona: "Zona Central",
      grupo_sanguineo: grupo,
      unidades: 1,
      campana_activa: "Donación Directa",
      activo: true
    }])
    .select()
    .single();

  if (errorInsert) {
    throw new Error("No se pudo crear el registro de stock: " + errorInsert.message);
  }

  return creado;
}

// ==================== VALIDACIÓN Y REGISTRO DE DONANTE ====================
formDonante.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = normalizarTexto(document.getElementById("nombreDonante").value);
  const grupo = document.getElementById("grupoDonante").value;
  const telefono = document.getElementById("telDonante").value.replace(/[\s()-]/g, "");
  const totalDonaciones = validarEnteroEnRango(
    document.getElementById("donacionesPrevias").value,
    0,
    200
  );

  if (!REGEX_NOMBRE_PERSONA.test(nombre)) {
    mostrarMensaje(
      "msgDonante",
      "El nombre del donante debe tener entre 3 y 80 caracteres y contener solo letras y espacios."
    );
    return;
  }

  if (!GRUPOS_VALIDOS.includes(grupo)) {
    mostrarMensaje("msgDonante", "Selecciona un grupo sanguíneo válido para el donante.");
    return;
  }

  if (!REGEX_TELEFONO.test(telefono)) {
    mostrarMensaje(
      "msgDonante",
      "Ingresa un número de WhatsApp válido (7 a 15 dígitos, opcionalmente con + al inicio)."
    );
    return;
  }

  if (totalDonaciones === null) {
    mostrarMensaje(
      "msgDonante",
      "El total de donaciones previas debe ser un número entero entre 0 y 200."
    );
    return;
  }

  const donanteDuplicado = donantesActuales.some(
    (d) =>
      normalizarTexto(d.nombre_completo).toLowerCase() === nombre.toLowerCase() &&
      String(d.telefono_whatsapp || "").replace(/[\s()-]/g, "") === telefono
  );
  if (donanteDuplicado) {
    mostrarMensaje(
      "msgDonante",
      "Este donante ya está registrado con el mismo nombre y teléfono."
    );
    return;
  }

  const hoy = new Date();
  const proxima = new Date(hoy);
  proxima.setDate(proxima.getDate() + 90);

  const insignia = obtenerInsigniaPorTotal(totalDonaciones);
  const ultimaStr = hoy.toISOString().split("T")[0];
  const proximaStr = proxima.toISOString().split("T")[0];

  const { data, error } = await db
    .from("donantes")
    .insert([{
      nombre_completo: nombre,
      grupo_sanguineo: grupo,
      telefono_whatsapp: telefono,
      total_donaciones: totalDonaciones,
      ultima_donacion: ultimaStr,
      proxima_fecha_disponible: proximaStr,
      insignia,
      activo: true
    }])
    .select()
    .single();

  if (error) {
    mostrarMensaje("msgDonante", "Error al registrar donante: " + error.message);
    return;
  }

  try {
    const stockAct = await incrementarStockPorGrupo(grupo);

    await db.from("donaciones").insert([{
      donante_id: data.id,
      stock_id: stockAct.id,
      nombre_donante: data.nombre_completo,
      grupo_sanguineo: grupo,
      unidades_aportadas: 1,
      centro_destino: stockAct.centro_nombre,
      fecha_donacion: ultimaStr,
      activo: true
    }]);

    await registrarAuditoria(
      "DONACION_PLUS_1",
      grupo,
      1,
      `Donación de ${data.nombre_completo} (+1 unid. en ${stockAct.centro_nombre})`
    );

    await cargarStock();
    await cargarDonantes(listaDonantesVisible);
    await cargarDonacionesHistorial();

    formDonante.reset();

    mostrarMensaje(
      "msgDonante",
      `Donante guardado y stock ${grupo} actualizado (+1 unid. en ${stockAct.centro_nombre}: ${stockAct.unidades} unid.).`,
      "ok"
    );
  } catch (errStock) {
    mostrarMensaje("msgDonante", "Donante guardado, pero falló al sumar stock: " + errStock.message);
  }

  document.getElementById("carnetResultado").innerHTML = `
    <strong>Carnet Digital #${Number(data.id)}</strong> — ${escaparHtml(data.nombre_completo)}<br/>
    Grupo: <span class="badge">${escaparHtml(data.grupo_sanguineo)}</span> · Total: <strong>${Number(data.total_donaciones)}</strong><br/>
    Insignia: <strong>${escaparHtml(insignia)}</strong><br/>
    Próxima fecha disponible: <strong>${escaparHtml(data.proxima_fecha_disponible)}</strong>
  `;

  const qrBox = document.getElementById("qrBox");
  qrBox.innerHTML = "";
  if (window.QRCode) {
    new QRCode(qrBox, {
      text: `HEMOCLOUD|DONANTE:${data.id}|NOMBRE:${data.nombre_completo}|GRUPO:${data.grupo_sanguineo}|PROXIMA:${data.proxima_fecha_disponible}`,
      width: 105,
      height: 105
    });
  }
});

// ==================== SOLICITUDES URGENTES ====================
async function cargarSolicitudes() {
  const { data, error } = await db
    .from("solicitudes_urgentes")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  const abiertas = rows.filter((r) => r.estado === "Abierta").length;
  const kpiUrg = document.getElementById("statSolicitudes");
  if (kpiUrg) kpiUrg.textContent = abiertas;

  tablaSolicitudes.innerHTML = "";
  if (rows.length === 0) {
    tablaSolicitudes.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem;">Sin solicitudes activas registradas.</td></tr>`;
    return;
  }

  rows.forEach((s) => {
    const msg = encodeURIComponent(
      `URGENTE (${s.hospital_solicitante} - ${s.zona}): Se requieren ${s.unidades_requeridas} unid. de sangre grupo ${s.grupo_sanguineo}.`
    );
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escaparHtml(s.hospital_solicitante)}</strong> · ${escaparHtml(s.zona)}</td>
      <td><span class="badge">${escaparHtml(s.grupo_sanguineo)}</span></td>
      <td><strong>${Number(s.unidades_requeridas)}</strong></td>
      <td><span class="${s.estado === "Abierta" ? "estado-abierta" : "estado-atendida"}">${escaparHtml(s.estado)}</span></td>
      <td>
        <div class="acciones-grupo">
          ${s.estado === "Abierta"
            ? `<button type="button" class="secundario" onclick="marcarSolicitudAtendida(${Number(s.id)})"><i class="bi bi-check2"></i> Atender</button>`
            : ""}
          <a href="https://wa.me/?text=${msg}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:inline-flex;">
            <button type="button" class="whatsapp"><i class="bi bi-whatsapp"></i> Avisar</button>
          </a>
        </div>
      </td>
    `;
    tablaSolicitudes.appendChild(tr);
  });
}

formSolicitudUrgente.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hospital = normalizarTexto(document.getElementById("urgHospital").value);
  const zona = normalizarTexto(document.getElementById("urgZona").value);
  const grupo = document.getElementById("urgGrupo").value;
  const unidades = validarEnteroEnRango(document.getElementById("urgUnidades").value, 1, 500);

  if (!REGEX_TEXTO_LUGAR.test(hospital)) {
    mostrarMensaje("msgUrgente", "El hospital solicitante debe tener entre 3 y 100 caracteres válidos.");
    return;
  }

  if (zona.length < 3 || zona.length > 80 || !REGEX_TEXTO_LUGAR.test(zona)) {
    mostrarMensaje("msgUrgente", "La zona debe tener entre 3 y 80 caracteres válidos.");
    return;
  }

  if (!GRUPOS_VALIDOS.includes(grupo)) {
    mostrarMensaje("msgUrgente", "Selecciona un grupo sanguíneo válido.");
    return;
  }

  if (unidades === null) {
    mostrarMensaje("msgUrgente", "Las unidades requeridas deben ser un número entero entre 1 y 500.");
    return;
  }

  const { error } = await db.from("solicitudes_urgentes").insert([{
    hospital_solicitante: hospital,
    zona,
    grupo_sanguineo: grupo,
    unidades_requeridas: unidades,
    estado: "Abierta",
    activo: true
  }]);

  if (error) {
    mostrarMensaje("msgUrgente", "Error al crear solicitud: " + error.message);
    return;
  }

  formSolicitudUrgente.reset();
  mostrarMensaje("msgUrgente", "Solicitud urgente registrada.", "ok");
  cargarSolicitudes();
});

window.marcarSolicitudAtendida = async function marcarSolicitudAtendida(id) {
  const { error } = await db
    .from("solicitudes_urgentes")
    .update({ estado: "Atendida" })
    .eq("id", id);
  if (!error) cargarSolicitudes();
};

// ==================== HISTORIAL Y CAMPAÑAS ====================
async function cargarDonacionesHistorial() {
  const { data, error } = await db
    .from("donaciones")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  conteoDonacionesHist = rows.length;
  actualizarKpiDonacionesCampanas();

  tablaDonacionesHist.innerHTML = "";
  if (rows.length === 0) {
    tablaDonacionesHist.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem;">Sin donaciones activas en historial.</td></tr>`;
    return;
  }

  rows.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escaparHtml(d.nombre_donante)}</strong></td>
      <td><span class="badge">${escaparHtml(d.grupo_sanguineo)}</span></td>
      <td><strong>+${Number(d.unidades_aportadas)}</strong> unid.</td>
      <td>${escaparHtml(d.centro_destino)}</td>
      <td class="nowrap-col">${escaparHtml(d.fecha_donacion)}</td>
    `;
    tablaDonacionesHist.appendChild(tr);
  });
}

async function cargarCampanas() {
  const { data, error } = await db
    .from("campanas_donacion")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  conteoCampanas = rows.length;
  actualizarKpiDonacionesCampanas();

  tablaCampanas.innerHTML = "";
  if (rows.length === 0) {
    tablaCampanas.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin campañas activas creadas.</td></tr>`;
    return;
  }

  rows.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escaparHtml(c.titulo)}</strong></td>
      <td>${escaparHtml(c.zona_sede)}</td>
      <td><strong>${Number(c.meta_unidades)}</strong> unid.</td>
      <td><span class="insignia-tag">${escaparHtml(c.estado)}</span></td>
    `;
    tablaCampanas.appendChild(tr);
  });
}

formCampana.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!puedeCrearCampana) {
    mostrarMensaje(
      "msgCampana",
      `Tu rol actual (${rolActual}) no puede crear campañas. Solo Administrador de Red o Coordinador de Banco de Sangre.`
    );
    return;
  }

  const titulo = normalizarTexto(document.getElementById("campTitulo").value);
  const zona = normalizarTexto(document.getElementById("campZona").value);
  const meta = validarEnteroEnRango(document.getElementById("campMeta").value, 1, 10000);

  if (titulo.length < 4 || titulo.length > 120) {
    mostrarMensaje("msgCampana", "El título de la campaña debe tener entre 4 y 120 caracteres.");
    return;
  }

  if (zona.length < 3 || zona.length > 80 || !REGEX_TEXTO_LUGAR.test(zona)) {
    mostrarMensaje("msgCampana", "La zona o sede debe tener entre 3 y 80 caracteres válidos.");
    return;
  }

  if (meta === null) {
    mostrarMensaje("msgCampana", "La meta de unidades debe ser un número entero entre 1 y 10,000.");
    return;
  }

  const { error } = await db.from("campanas_donacion").insert([{
    titulo,
    zona_sede: zona,
    meta_unidades: meta,
    estado: "Activa",
    activo: true
  }]);

  if (error) {
    mostrarMensaje("msgCampana", "Error al crear campaña: " + error.message);
    return;
  }

  formCampana.reset();
  mostrarMensaje("msgCampana", "Campaña creada correctamente.", "ok");
  cargarCampanas();
});

// ==================== AUDITORÍA Y PERSONAL ====================
async function cargarAuditoria() {
  const { data, error } = await db
    .from("auditoria_movimientos")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: false })
    .limit(25);

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  tablaAuditoria.innerHTML = "";

  if (rows.length === 0) {
    tablaAuditoria.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin movimientos activos registrados aún.</td></tr>`;
    return;
  }

  rows.forEach((a) => {
    const cambio = Number(a.cambio_unidades || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escaparHtml(a.tipo_movimiento)}</strong></td>
      <td><span class="badge">${escaparHtml(a.grupo_sanguineo)}</span></td>
      <td><strong>${cambio > 0 ? "+" + cambio : cambio}</strong></td>
      <td>${escaparHtml(a.detalle)}</td>
    `;
    tablaAuditoria.appendChild(tr);
  });
}

async function cargarPersonal() {
  const { data, error } = await db
    .from("personal_acceso")
    .select("*")
    .eq("activo", true)
    .order("id", { ascending: true })
    .limit(20);

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  tablaPersonal.innerHTML = "";

  if (rows.length === 0) {
    tablaPersonal.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin personal activo registrado.</td></tr>`;
    return;
  }

  rows.forEach((p, idx) => {
    const fechaFmt = p.ultimo_acceso ? new Date(p.ultimo_acceso).toLocaleString() : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong> · ${escaparHtml(p.nombre_completo)}</td>
      <td>${escaparHtml(p.correo)}</td>
      <td><span class="insignia-tag">${escaparHtml(p.rol)}</span></td>
      <td class="nowrap-col">${escaparHtml(fechaFmt)}</td>
    `;
    tablaPersonal.appendChild(tr);
  });
}

if (sesionActiva) {
  cargarStock();
  cargarDonantes(false);
  cargarSolicitudes();
  cargarDonacionesHistorial();
  cargarCampanas();
}
