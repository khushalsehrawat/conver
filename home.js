(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  if (window.AOS) {
    window.AOS.init({
      once: true,
      offset: 10,
      duration: 800,
      easing: "ease-out-cubic"
    });
  }

  if (window.VanillaTilt) {
    window.VanillaTilt.init(document.querySelectorAll(".js-tilt"), {
      max: 6,
      speed: 600,
      glare: true,
      "max-glare": 0.12,
      scale: 1.01
    });
  }
})();

