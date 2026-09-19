/**
 * Quick View Popup
 * --------------------------------------------------------------------------
 * Vanilla JavaScript only - no jQuery, no build step required.
 *
 * Responsibilities:
 *   1. Open the modal when a product grid "circle" trigger is clicked.
 *   2. Fetch the product as JSON (/products/{handle}.js) and render title,
 *      price, description and variant options dynamically.
 *   3. Track the shopper's selected options and resolve the matching variant.
 *   4. Submit "Add to cart" through the Ajax Cart API (/cart/add.js).
 *   5. Apply the linked-product rule: if the chosen variant matches the
 *      configured color + size, a second product is added automatically.
 */
(function () {
  'use strict';

  var modal = document.getElementById('QuickViewModal');
  if (!modal) return;

  var els = {
    image: document.getElementById('QuickViewImage'),
    title: document.getElementById('QuickViewTitle'),
    price: document.getElementById('QuickViewPrice'),
    description: document.getElementById('QuickViewDescription'),
    options: document.getElementById('QuickViewOptions'),
    form: document.getElementById('QuickViewForm'),
    error: document.getElementById('QuickViewError'),
    addToCartButton: document.getElementById('QuickViewAddToCart')
  };

  // Rule configuration comes from the snippet's data-* attributes, so it can
  // be changed from the customizer without touching this file.
  var linkedRule = {
    productHandle: modal.dataset.linkedProductHandle || '',
    color: (modal.dataset.linkedOptionColor || '').toLowerCase(),
    size: (modal.dataset.linkedOptionSize || '').toLowerCase()
  };

  var currentProduct = null;
  var selectedOptions = [];
  var linkedProductCache = null; // avoid re-fetching the linked product on every add-to-cart

  /* ------------------------------- Open / Close ------------------------------ */

  function openModal(handle) {
    fetchProduct(handle)
      .then(function (product) {
        currentProduct = product;
        // Pre-select the first variant's combination as the default state.
        selectedOptions = product.variants[0].options.slice();
        render();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('quick-view-open');
      })
      .catch(function (err) {
        console.error('Quick view: could not load product "' + handle + '"', err);
      });
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('quick-view-open');
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-quick-view-trigger]');
    if (trigger) {
      event.preventDefault();
      openModal(trigger.dataset.productHandle);
      return;
    }
    if (event.target.closest('[data-quick-view-close]')) {
      closeModal();
      return;
    }
    // Any other click on the page closes open dropdowns (see renderDropdown).
    closeAllDropdowns();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  /* --------------------------------- Data fetch -------------------------------- */

  function fetchProduct(handle) {
    return fetch('/products/' + handle + '.js').then(function (response) {
      if (!response.ok) throw new Error('Product not found: ' + handle);
      return response.json();
    });
  }

  function getLinkedProduct() {
    if (linkedProductCache) return Promise.resolve(linkedProductCache);
    if (!linkedRule.productHandle) return Promise.resolve(null);
    return fetchProduct(linkedRule.productHandle).then(function (product) {
      linkedProductCache = product;
      return product;
    });
  }

  /* ----------------------------------- Render ----------------------------------- */

  function render() {
    var product = currentProduct;
    var variant = getSelectedVariant();
    var image = getImageSrc(variant && variant.featured_image) || getImageSrc(product.featured_image);

    els.image.src = image;
    els.image.alt = product.title;
    els.title.textContent = product.title;
    els.price.textContent = formatMoney(variant ? variant.price : product.price);
    els.description.innerHTML = product.description;

    renderOptions();
    updateAddToCartState(variant);
  }

  // Maps common color option values to the swatch's accent/fill color.
  // Unrecognized values fall back to a neutral placeholder.
  var COLOR_MAP = {
    black: '#000000',
    white: '#ffffff',
    grey: '#9a9a9a',
    gray: '#9a9a9a',
    blue: '#3b5998',
    red: '#c0392b',
    green: '#4a5d3a',
    yellow: '#fff544',
    brown: '#6b4a2f',
    beige: '#e8dcc8',
    navy: '#1b2a4a',
    pink: '#e8a0bf'
  };

  // Some product JSON sources return option names as plain strings
  // (["Color", "Size"]), others as objects ([{ name: "Color", ... }]).
  // Normalize to a string either way.
  function getOptionName(option) {
    if (typeof option === 'string') return option;
    return (option && option.name) || '';
  }

  // product.featured_image is a plain URL string, but variant.featured_image
  // is an object with a .src property. Normalize both to a URL string.
  function getImageSrc(image) {
    if (!image) return '';
    return typeof image === 'string' ? image : image.src || '';
  }

  // Picks black or white text for a selected swatch, based on its background color.
  function getContrastTextColor(hex) {
    var clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean
        .split('')
        .map(function (c) {
          return c + c;
        })
        .join('');
    }
    var r = parseInt(clean.substr(0, 2), 16);
    var g = parseInt(clean.substr(2, 2), 16);
    var b = parseInt(clean.substr(4, 2), 16);
    var yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#111111' : '#ffffff';
  }

  function renderOptions() {
    var product = currentProduct;
    els.options.innerHTML = '';

    product.options.forEach(function (rawOptionName, optionIndex) {
      var optionName = getOptionName(rawOptionName);

      var wrapper = document.createElement('div');
      wrapper.className = 'quick-view-modal__option';

      var label = document.createElement('p');
      label.className = 'quick-view-modal__option-label';
      label.textContent = optionName;
      wrapper.appendChild(label);

      if (isColorOption(optionName)) {
        wrapper.appendChild(renderColorSwatches(optionIndex));
      } else {
        wrapper.appendChild(renderDropdown(optionName, optionIndex));
      }

      els.options.appendChild(wrapper);
    });
  }

  function isColorOption(optionName) {
    return /colou?r/i.test(optionName);
  }

  // Color options render as white buttons with a thin left-edge color accent
  // when unselected. The selected value's button fills entirely with its
  // color, with contrast-adjusted text — matches the Figma prototype.
  function renderColorSwatches(optionIndex) {
    var valuesWrap = document.createElement('div');
    valuesWrap.className = 'quick-view-modal__option-values';

    getValuesForOption(optionIndex).forEach(function (value) {
      var accentColor = COLOR_MAP[value.toLowerCase()] || '#cccccc';

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'quick-view-modal__swatch';
      button.textContent = value;
      button.style.setProperty('--swatch-color', accentColor);

      if (selectedOptions[optionIndex] === value) {
        button.classList.add('is-selected');
        button.style.setProperty('--swatch-text-color', getContrastTextColor(accentColor));
      }
      if (!isCombinationAvailable(optionIndex, value)) {
        button.classList.add('is-unavailable');
      }

      button.addEventListener('click', function () {
        if (button.classList.contains('is-unavailable')) return;
        selectedOptions[optionIndex] = value;
        render();
      });

      valuesWrap.appendChild(button);
    });

    return valuesWrap;
  }

  // Every other option (Size, etc.) renders as a custom dropdown: a trigger
  // showing the current value + chevron, and a panel of rows underneath -
  // matching the "Choose your size" pattern in the design.
  function renderDropdown(optionName, optionIndex) {
    var wrap = document.createElement('div');
    wrap.className = 'quick-view-modal__dropdown';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'quick-view-modal__dropdown-trigger';
    trigger.innerHTML =
      '<span data-dropdown-label></span>' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    trigger.querySelector('[data-dropdown-label]').textContent =
      selectedOptions[optionIndex] || 'Choose your ' + optionName.toLowerCase();

    var panel = document.createElement('div');
    panel.className = 'quick-view-modal__dropdown-panel';

    getValuesForOption(optionIndex).forEach(function (value) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'quick-view-modal__dropdown-option';
      option.textContent = value;

      if (selectedOptions[optionIndex] === value) option.classList.add('is-selected');
      if (!isCombinationAvailable(optionIndex, value)) option.disabled = true;

      option.addEventListener('click', function () {
        selectedOptions[optionIndex] = value;
        render();
      });

      panel.appendChild(option);
    });

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      var willOpen = !wrap.classList.contains('is-open');
      closeAllDropdowns();
      if (willOpen) wrap.classList.add('is-open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    return wrap;
  }

  function closeAllDropdowns() {
    els.options.querySelectorAll('.quick-view-modal__dropdown.is-open').forEach(function (node) {
      node.classList.remove('is-open');
    });
  }

  // Unique list of values that exist for a given option index (e.g. all colors).
  function getValuesForOption(optionIndex) {
    var seen = [];
    currentProduct.variants.forEach(function (variant) {
      var value = variant.options[optionIndex];
      if (seen.indexOf(value) === -1) seen.push(value);
    });
    return seen;
  }

  // A value is selectable if some in-stock variant matches it *and* every
  // option the shopper has already picked elsewhere.
  function isCombinationAvailable(optionIndex, value) {
    return currentProduct.variants.some(function (variant) {
      if (variant.options[optionIndex] !== value) return false;
      var matchesOtherSelections = variant.options.every(function (opt, i) {
        return i === optionIndex || opt === selectedOptions[i];
      });
      return matchesOtherSelections && variant.available;
    });
  }

  function getSelectedVariant() {
    return currentProduct.variants.find(function (variant) {
      return variant.options.every(function (opt, i) {
        return opt === selectedOptions[i];
      });
    });
  }

  function updateAddToCartState(variant) {
    var available = !!(variant && variant.available);
    els.addToCartButton.disabled = !available;
    els.addToCartButton.classList.toggle('is-disabled', !available);
    els.error.hidden = available;
    if (!available) {
      els.error.textContent = variant ? 'This combination is sold out.' : 'This combination is unavailable.';
    }
  }

  /* -------------------------------- Add to cart --------------------------------- */

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var variant = getSelectedVariant();
    if (!variant || !variant.available) return;

    setLoading(true);

    buildCartItems(variant)
      .then(addToCart)
      .then(function () {
        // Send the shopper straight to the cart page to review/checkout.
        window.location.href = '/cart';
      })
      .catch(function (err) {
        setLoading(false);
        els.error.hidden = false;
        els.error.textContent = 'Something went wrong adding this to your cart. Please try again.';
        console.error(err);
      });
  });

  // Builds the line items to submit, applying the linked-product rule when
  // the shopper's selection matches the configured trigger (color + size).
  function getOptionIndexByName(optionName) {
    if (!currentProduct || !Array.isArray(currentProduct.options)) return -1;

    return currentProduct.options.findIndex(function (rawOptionName) {
      return getOptionName(rawOptionName).toLowerCase() === optionName.toLowerCase();
    });
  }

  function buildCartItems(variant) {
    var items = [{ id: variant.id, quantity: 1 }];

    var colorIndex = getOptionIndexByName('Color');
    var sizeIndex = getOptionIndexByName('Size');
    var selectedColor = colorIndex >= 0 && selectedOptions[colorIndex] ? selectedOptions[colorIndex].toLowerCase() : '';
    var selectedSize = sizeIndex >= 0 && selectedOptions[sizeIndex] ? selectedOptions[sizeIndex].toLowerCase() : '';

    var shouldAutoAddLinkedProduct =
      !!linkedRule.productHandle &&
      !!linkedRule.color &&
      !!linkedRule.size &&
      selectedColor === linkedRule.color &&
      selectedSize === linkedRule.size;

    if (!shouldAutoAddLinkedProduct) {
      return Promise.resolve(items);
    }

    return getLinkedProduct().then(function (linkedProduct) {
      if (!linkedProduct || !Array.isArray(linkedProduct.variants) || linkedProduct.variants.length === 0) {
        return items;
      }

      var linkedVariant =
        linkedProduct.variants.find(function (v) {
          return v.available;
        }) || linkedProduct.variants[0];

      if (!linkedVariant || !linkedVariant.id) {
        return items;
      }

      items.push({ id: linkedVariant.id, quantity: 1 });
      return items;
    });
  }

  function addToCart(items) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (response) {
      if (!response.ok) throw new Error('Add to cart request failed');
      return response.json();
    });
  }

  function setLoading(isLoading) {
    els.addToCartButton.disabled = isLoading;
    els.addToCartButton.querySelector('[data-default-text]').hidden = isLoading;
    els.addToCartButton.querySelector('[data-loading-text]').hidden = !isLoading;
  }

  // Cents -> "980,00€". Swap for Shopify.formatMoney(cents, format) if the
  // theme already exposes a money format from settings_data.json.
  function formatMoney(cents) {
    return (cents / 100).toFixed(2).replace('.', ',') + '€';
  }
})();