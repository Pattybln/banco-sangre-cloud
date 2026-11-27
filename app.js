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

let stockActual = [];
let listaDonantesVisible = false;
let conteoDonacionesHist = 0;
let conteoCampanas = 0;

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
    const destino = contenedorId === "msgStock" ? formStock : formDonante;
    destino.parentNode.insertBefore(caja, destino);
  }

  caja.className = `alerta-feedback ${tipo === "ok" ? "alerta-ok" : "alerta-error"}`;
  caja.innerHTML = `<i class="bi ${tipo === "ok" ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"}"></i> <span>${texto}</span>`;
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
    detalle: `${detalle} · Por: ${actor}`
  }]);
}

async function cargarStock() {
  const { data, error } = await db
    .from("stock_sangre")
    .select("*")
    .order("id", { ascending: false });

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
          No hay registros de stock para el filtro seleccionado.
        </td>
      </tr>
    `;
    return;
  }

  filtrados.forEach((item) => {
    const mensajeWa = encodeURIComponent(
      `URGENTE - Cadena de donantes: Se necesita sangre grupo ${item.grupo_sanguineo} en ${item.centro_nombre} (${item.ciudad_o_zona}). Unidades actuales: ${item.unidades}. Si no puedes donar, reenvía este mensaje.`
    );
    const linkWa = `https://wa.me/?text=${mensajeWa}`;
    const porcentaje = Math.min(100, Math.round((Number(item.unidades) / 25) * 100));
    const claseBarra = Number(item.unidades) >= 5 ? "ok" : "";

    const botonEliminar = puedeEliminarStock
      ? `<button type="button" class="peligro" onclick="eliminarStock(${item.id})">
           <i class="bi bi-trash3-fill"></i> Eliminar
         </button>`
      : `<button type="button" class="peligro" style="opacity:0.6;" title="Solo Administrador de Red" onclick="avisoSinPermisoEliminar()">
           <i class="bi bi-lock-fill"></i> Eliminar
         </button>`;

    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td><strong>${item.centro_nombre}</strong></td>
      <td>${item.ciudad_o_zona}${item.campana_activa ? " · <span style='color:#be123c;font-weight:600;'>" + item.campana_activa + "</span>" : ""}</td>
      <td><span class="badge">${item.grupo_sanguineo}</span></td>
      <td>
        <strong>${item.unidades}</strong> unid.
        <div class="stock-meter">
          <div class="stock-meter-fill ${claseBarra}" style="width:${porcentaje}%"></div>
        </div>
      </td>
      <td>
        <div class="acciones-grupo">
          <button type="button" class="secundario" onclick="prepararEdicionPorId(${item.id})">
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
    `Tu rol actual (${rolActual}) no puede eliminar registros de stock. Solo Administrador de Red puede eliminar.`
  );
};

filtroGrupo.addEventListener("change", cargarStock);

window.cargarDonantes = async function cargarDonantes(forzarRender = false) {
  const { data, error } = await db
    .from("donantes")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    mostrarMensaje("msgDonante", "Error al cargar donantes: " + error.message, "error");
    return;
  }

  const registros = Array.isArray(data) ? data : [];
  if (totalDonantesBadge) {
    totalDonantesBadge.textContent = registros.length;
  }

  if (!listaDonantesVisible && !forzarRender) {
    return;
  }

  tablaDonantes.innerHTML = "";
  if (registros.length === 0) {
    tablaDonantes.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#64748b; padding:1.5rem;">
          Todavía no hay donantes registrados.
        </td>
      </tr>
    `;
    return;
  }

  registros.forEach((donante) => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td><strong>#${donante.id}</strong> · ${donante.nombre_completo}</td>
      <td><span class="badge">${donante.grupo_sanguineo}</span></td>
      <td>${donante.telefono_whatsapp}</td>
      <td>
        <strong>${donante.total_donaciones}</strong> don.
        <div><span class="insignia-tag">${donante.insignia || "Donante Activo"}</span></div>
      </td>
      <td class="nowrap-col">${donante.proxima_fecha_disponible || "-"}</td>
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

formStock.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("stockId").value;
  const centroNombre = document.getElementById("centroNombre").value.trim();
  const zona = document.getElementById("zona").value.trim();
  const grupo = document.getElementById("grupoStock").value;
  const unidadesRaw = document.getElementById("unidades").value.trim();
  const unidades = Number(unidadesRaw);
  const campana = document.getElementById("campana").value.trim();

  if (centroNombre.length < 3 || zona.length < 3 || !GRUPOS_VALIDOS.includes(grupo)) {
    mostrarMensaje("msgStock", "Completa los campos requeridos con datos válidos.");
    return;
  }
  if (unidadesRaw === "" || !Number.isInteger(unidades) || unidades < 0 || unidades > 10000) {
    mostrarMensaje("msgStock", "Las unidades deben ser un número entero entre 0 y 10,000.");
    return;
  }

  const payload = {
    centro_nombre: centroNombre,
    ciudad_o_zona: zona,
    grupo_sanguineo: grupo,
    unidades,
    campana_activa: campana || null
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
  if (!confirm("¿Eliminar este registro de stock?")) return;
  const item = stockActual.find((r) => Number(r.id) === Number(id));
  const { error } = await db.from("stock_sangre").delete().eq("id", id);
  if (error) {
    mostrarMensaje("msgStock", "Error al eliminar: " + error.message);
    return;
  }
  await registrarAuditoria(
    "ELIMINACION_STOCK",
    item ? item.grupo_sanguineo : "N/A",
    0,
    `Eliminó registro de stock ID #${id}${item ? " (" + item.centro_nombre + ")" : ""}`
  );
  mostrarMensaje("msgStock", "Registro eliminado.", "ok");
  cargarStock();
};

async function incrementarStockPorGrupo(grupo) {
  const { data: existentes, error: errorConsulta } = await db
    .from("stock_sangre")
    .select("*")
    .eq("grupo_sanguineo", grupo)
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
      campana_activa: "Donación Directa"
    }])
    .select()
    .single();

  if (errorInsert) {
    throw new Error("No se pudo crear el registro de stock: " + errorInsert.message);
  }

  return creado;
}

formDonante.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombreDonante").value.trim();
  const grupo = document.getElementById("grupoDonante").value;
  const telefono = document.getElementById("telDonante").value.replace(/\s+/g, "");
  const totalDonaciones = Number(document.getElementById("donacionesPrevias").value);

  const hoy = new Date();
  const proxima = new Date(hoy);
  proxima.setDate(proxima.getDate() + 90);

  const insignia =
    totalDonaciones >= 5 ? "Nivel 5+ Donaciones (Héroe)" :
    totalDonaciones === 1 ? "Primera Donación" :
    "Donante Activo";

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
      insignia
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
      fecha_donacion: ultimaStr
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

    mostrarMensaje(
      "msgDonante",
      `Donante guardado y stock ${grupo} actualizado (+1 unid. en ${stockAct.centro_nombre}: ${stockAct.unidades} unid.).`,
      "ok"
    );
  } catch (errStock) {
    mostrarMensaje("msgDonante", "Donante guardado, pero falló al sumar stock: " + errStock.message);
  }

  document.getElementById("carnetResultado").innerHTML = `
    <strong>Carnet Digital #${data.id}</strong> — ${data.nombre_completo}<br/>
    Grupo: <span class="badge">${data.grupo_sanguineo}</span> · Total: <strong>${data.total_donaciones}</strong><br/>
    Insignia: <strong>${data.insignia}</strong><br/>
    Próxima fecha disponible: <strong>${data.proxima_fecha_disponible}</strong>
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

async function cargarSolicitudes() {
  const { data, error } = await db
    .from("solicitudes_urgentes")
    .select("*")
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  const abiertas = rows.filter((r) => r.estado === "Abierta").length;
  const kpiUrg = document.getElementById("statSolicitudes");
  if (kpiUrg) kpiUrg.textContent = abiertas;

  tablaSolicitudes.innerHTML = "";
  if (rows.length === 0) {
    tablaSolicitudes.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem;">Sin solicitudes registradas.</td></tr>`;
    return;
  }

  rows.forEach((s) => {
    const msg = encodeURIComponent(
      `URGENTE (${s.hospital_solicitante} - ${s.zona}): Se requieren ${s.unidades_requeridas} unid. de sangre grupo ${s.grupo_sanguineo}.`
    );
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${s.hospital_solicitante}</strong> · ${s.zona}</td>
      <td><span class="badge">${s.grupo_sanguineo}</span></td>
      <td><strong>${s.unidades_requeridas}</strong></td>
      <td><span class="${s.estado === "Abierta" ? "estado-abierta" : "estado-atendida"}">${s.estado}</span></td>
      <td>
        <div class="acciones-grupo">
          ${s.estado === "Abierta"
            ? `<button type="button" class="secundario" onclick="marcarSolicitudAtendida(${s.id})"><i class="bi bi-check2"></i> Atender</button>`
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
  const hospital = document.getElementById("urgHospital").value.trim();
  const zona = document.getElementById("urgZona").value.trim();
  const grupo = document.getElementById("urgGrupo").value;
  const unidades = Number(document.getElementById("urgUnidades").value);

  const { error } = await db.from("solicitudes_urgentes").insert([{
    hospital_solicitante: hospital,
    zona,
    grupo_sanguineo: grupo,
    unidades_requeridas: unidades,
    estado: "Abierta"
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

async function cargarDonacionesHistorial() {
  const { data, error } = await db
    .from("donaciones")
    .select("*")
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  conteoDonacionesHist = rows.length;
  actualizarKpiDonacionesCampanas();

  tablaDonacionesHist.innerHTML = "";
  if (rows.length === 0) {
    tablaDonacionesHist.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem;">Sin donaciones en historial.</td></tr>`;
    return;
  }

  rows.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${d.nombre_donante}</strong></td>
      <td><span class="badge">${d.grupo_sanguineo}</span></td>
      <td><strong>+${d.unidades_aportadas}</strong> unid.</td>
      <td>${d.centro_destino}</td>
      <td class="nowrap-col">${d.fecha_donacion}</td>
    `;
    tablaDonacionesHist.appendChild(tr);
  });
}

async function cargarCampanas() {
  const { data, error } = await db
    .from("campanas_donacion")
    .select("*")
    .order("id", { ascending: false });

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  conteoCampanas = rows.length;
  actualizarKpiDonacionesCampanas();

  tablaCampanas.innerHTML = "";
  if (rows.length === 0) {
    tablaCampanas.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin campañas creadas.</td></tr>`;
    return;
  }

  rows.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.titulo}</strong></td>
      <td>${c.zona_sede}</td>
      <td><strong>${c.meta_unidades}</strong> unid.</td>
      <td><span class="insignia-tag">${c.estado}</span></td>
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

  const titulo = document.getElementById("campTitulo").value.trim();
  const zona = document.getElementById("campZona").value.trim();
  const meta = Number(document.getElementById("campMeta").value);

  const { error } = await db.from("campanas_donacion").insert([{
    titulo,
    zona_sede: zona,
    meta_unidades: meta,
    estado: "Activa"
  }]);

  if (error) {
    mostrarMensaje("msgCampana", "Error al crear campaña: " + error.message);
    return;
  }

  formCampana.reset();
  mostrarMensaje("msgCampana", "Campaña creada correctamente.", "ok");
  cargarCampanas();
});

async function cargarAuditoria() {
  const { data, error } = await db
    .from("auditoria_movimientos")
    .select("*")
    .order("id", { ascending: false })
    .limit(25);

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  tablaAuditoria.innerHTML = "";

  if (rows.length === 0) {
    tablaAuditoria.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin movimientos registrados aún.</td></tr>`;
    return;
  }

  rows.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${a.tipo_movimiento}</strong></td>
      <td><span class="badge">${a.grupo_sanguineo}</span></td>
      <td><strong>${a.cambio_unidades > 0 ? "+" + a.cambio_unidades : a.cambio_unidades}</strong></td>
      <td>${a.detalle}</td>
    `;
    tablaAuditoria.appendChild(tr);
  });
}

async function cargarPersonal() {
  const { data, error } = await db
    .from("personal_acceso")
    .select("*")
    .order("id", { ascending: false })
    .limit(15);

  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  tablaPersonal.innerHTML = "";

  if (rows.length === 0) {
    tablaPersonal.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.5rem;">Sin personal registrado.</td></tr>`;
    return;
  }

  rows.forEach((p) => {
    const fechaFmt = p.ultimo_acceso ? new Date(p.ultimo_acceso).toLocaleString() : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.nombre_completo}</strong></td>
      <td>${p.correo}</td>
      <td><span class="insignia-tag">${p.rol}</span></td>
      <td class="nowrap-col">${fechaFmt}</td>
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