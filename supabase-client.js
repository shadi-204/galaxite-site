/* One shared, single-flight Supabase browser client for Galaxite. */
(() => {
  const cfg = window.AUTH_CONFIG || {};
  const sources = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2.119.2/dist/umd/supabase.js"
  ];
  let client = window.GALAXITE_SUPABASE_CLIENT || null;
  let clientPromise = null;
  let sdkPromise = null;

  function loadFrom(url) {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return Promise.resolve(window.supabase);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (error) {
          script.remove();
          reject(error);
          return;
        }
        if (window.supabase && typeof window.supabase.createClient === "function") {
          resolve(window.supabase);
        } else {
          script.remove();
          reject(new Error("Supabase SDK loaded without its createClient export."));
        }
      };
      const timeout = window.setTimeout(
        () => finish(new Error("Supabase SDK request timed out.")),
        12000
      );
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => finish(null);
      script.onerror = () => finish(new Error("Supabase SDK CDN could not be reached."));
      document.head.appendChild(script);
    });
  }

  async function loadSdk() {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return window.supabase;
    }
    if (!sdkPromise) {
      sdkPromise = (async () => {
        let lastError = null;
        for (const url of sources) {
          try {
            return await loadFrom(url);
          } catch (error) {
            lastError = error;
            console.warn("Galaxite: Supabase CDN failed; trying the fallback.", url, error);
          }
        }
        throw lastError || new Error("No Supabase SDK CDN could be loaded.");
      })().finally(() => {
        sdkPromise = null;
      });
    }
    return sdkPromise;
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    if (cfg.provider !== "supabase" || !cfg.supabase?.url || !cfg.supabase?.anonKey) {
      return Promise.resolve(null);
    }
    if (!clientPromise) {
      clientPromise = loadSdk()
        .then((sdk) => {
          client = sdk.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
            auth: {
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true
            }
          });
          window.GALAXITE_SUPABASE_CLIENT = client;
          return client;
        })
        .catch((error) => {
          clientPromise = null;
          throw error;
        });
    }
    return clientPromise;
  }

  window.GALAXITE_GET_SUPABASE_CLIENT = getClient;
})();
