// Check for native lazyload support if not load JS library
(async () => {
  if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img.lazyload')
    images.forEach(img => {
      img.src = img.dataset.src
    })
  } else {
    // Dynamically import the LazySizes library
    const lazySizesLib = await import(/* webpackChunkName: "lazysizes" */ /* webpackPrefetch: true */ 'lazysizes/lazysizes')
    // Initiate LazySizes (reads data-src & class=lazyload)
    lazySizes.init() // lazySizes works off a global.
  }
})()
