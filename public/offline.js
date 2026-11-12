document.getElementById("retry").addEventListener("click", () => {
  // Fallbacks preserve the attempted URL. Direct visits to this file return home.
  if (window.location.pathname === "/offline.html") window.location.replace("/");
  else window.location.reload();
});
