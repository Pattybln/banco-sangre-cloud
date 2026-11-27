const SUPABASE_URL = "https://dousxjmfxyrlepsjnmpd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yFgwE7iPDgZbtAI-NY7gVA_YoxE1Bf7";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = "hemocloud_sesion_activa";

function mostrarAlerta(id, texto, tipo = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alerta-feedback ${tipo === "ok" ? "alerta-ok" : "alerta-error"}`;
  el.innerHTML = `<i class="bi ${tipo === "ok" ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"}"></i> <span>${texto}</span>`;
  el.style.display = "flex";
}

// Formulario de registro (registro.html)
const formRegistro = document.getElementById("formRegistro");
if (formRegistro) {
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("regNombre").value.trim();
    const rol = document.getElementById("regRol").value;
    const correo = document.getElementById("regCorreo").value.trim().toLowerCase();
    const clave = document.getElementById("regClave").value;

    if (nombre.length < 3 || clave.length < 6) {
      mostrarAlerta("msgRegistro", "Ingresa un nombre válido y contraseña de al menos 6 caracteres.");
      return;
    }

    let authUserId = null;
    const { data: authData, error: authError } = await db.auth.signUp({
      email: correo,
      password: clave,
      options: { data: { nombre_completo: nombre, rol } }
    });

    const msgAuth = (authError?.message || "").toLowerCase();
    const esRateLimit = msgAuth.includes("rate limit");
    const yaRegistrado = msgAuth.includes("already registered");

    if (authError && !esRateLimit && !yaRegistrado) {
      mostrarAlerta("msgRegistro", "No se pudo registrar en Auth: " + authError.message);
      return;
    }

    if (authData && authData.user) {
      authUserId = authData.user.id;
    }

    const { error: tablaError } = await db
      .from("personal_acceso")
      .upsert([{
        nombre_completo: nombre,
        correo,
        rol,
        ultimo_acceso: new Date().toISOString()
      }], { onConflict: "correo" });

    if (tablaError) {
      mostrarAlerta("msgRegistro", "Error al guardar perfil: " + tablaError.message);
      return;
    }

    const cuentasLocales = JSON.parse(localStorage.getItem("hemocloud_cuentas_demo") || "[]");
    const sinDuplicado = cuentasLocales.filter((c) => c.correo.toLowerCase() !== correo);
    sinDuplicado.push({ nombre, rol, correo, clave, authUserId });
    localStorage.setItem("hemocloud_cuentas_demo", JSON.stringify(sinDuplicado));

    const nota = esRateLimit
      ? " (límite de correos de Auth alcanzado; cuenta habilitada para iniciar sesión)"
      : "";

    mostrarAlerta(
      "msgRegistro",
      `Cuenta creada correctamente${nota}. Redirigiendo a Iniciar Sesión...`,
      "ok"
    );
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1100);
  });
}

// Formulario de login (login.html)
const formLogin = document.getElementById("formLogin");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = document.getElementById("loginCorreo").value.trim().toLowerCase();
    const clave = document.getElementById("loginClave").value;

    let nombreUsuario = correo.split("@")[0];
    let rolUsuario = "Coordinador de Banco de Sangre";
    let autenticado = false;

    const { data: signData, error: signError } = await db.auth.signInWithPassword({
      email: correo,
      password: clave
    });

    if (!signError && signData && signData.user) {
      autenticado = true;
      nombreUsuario = signData.user.user_metadata?.nombre_completo || nombreUsuario;
      rolUsuario = signData.user.user_metadata?.rol || rolUsuario;
    } else {
      const cuentasLocales = JSON.parse(localStorage.getItem("hemocloud_cuentas_demo") || "[]");
      const encontrada = cuentasLocales.find(
        (c) => c.correo.toLowerCase() === correo && c.clave === clave
      );
      if (encontrada) {
        autenticado = true;
        nombreUsuario = encontrada.nombre;
        rolUsuario = encontrada.rol;
      }
    }

    if (!autenticado) {
      mostrarAlerta(
        "msgLogin",
        "Correo o contraseña incorrectos. Si aún no tienes cuenta, haz clic en 'Crear cuenta nueva'."
      );
      return;
    }

    const { data: perfil } = await db
      .from("personal_acceso")
      .upsert([{
        nombre_completo: nombreUsuario,
        correo,
        rol: rolUsuario,
        ultimo_acceso: new Date().toISOString()
      }], { onConflict: "correo" })
      .select()
      .single();

    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        nombre: perfil?.nombre_completo || nombreUsuario,
        correo,
        rol: perfil?.rol || rolUsuario
      })
    );

    window.location.href = "index.html";
  });
}