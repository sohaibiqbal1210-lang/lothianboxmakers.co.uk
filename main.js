/* =========================================================================
   Lothian Box Makers
   ========================================================================= */

(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ------------------------------------------------------------- theme */

  var root = document.documentElement;
  var themeBtn = $('#themeToggle');

  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    var dark = mode === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#060e1e' : '#041533');
  }

  applyTheme(root.getAttribute('data-theme') || 'light');

  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('lbm-theme', next); } catch (e) {}
  });

  /* --------------------------------------------------------------- nav */

  var navBtn = $('#navToggle');
  var nav = $('#nav');

  navBtn.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    navBtn.setAttribute('aria-expanded', String(open));
    navBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A' && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      navBtn.setAttribute('aria-expanded', 'false');
      navBtn.setAttribute('aria-label', 'Open menu');
    }
  });

  /* ------------------------------------------------------------ reveal */

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.reveal');

  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(targets, function (el, i) {
      el.style.transitionDelay = (i % 4) * 60 + 'ms';
      io.observe(el);
    });
  }

  /* ------------------------------------------- header mark on scroll */

  /* The hero already shows the logo, so the header only carries it once the
     hero has scrolled away. IntersectionObserver, not a scroll listener. */
  var topbar = document.querySelector('.topbar');
  var heroSection = document.querySelector('.hero');
  var brandLink = document.querySelector('.brand');

  if (topbar && heroSection && 'IntersectionObserver' in window) {
    var brandIo = new IntersectionObserver(function (entries) {
      var past = !entries[0].isIntersecting;
      topbar.classList.toggle('is-scrolled', past);
      /* keep it out of the tab order while it is invisible */
      if (brandLink) brandLink.setAttribute('tabindex', past ? '0' : '-1');
    }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 });

    brandIo.observe(heroSection);
  }

  /* ================================================== box finder logic */

  /* Board grades. Figures are Lothian Box Makers' own published specification.
     wall = board thickness in cm, applied to both sides of every dimension. */
  var GRADES = {
    B:  { name: 'B Flute, single wall',  wall: 0.3, ect: '5.2 kN/m', use: 'Postal, retail and light goods up to about 10kg.' },
    BE: { name: 'BE Flute, double wall', wall: 0.5, ect: '8.7 kN/m', use: 'Moving, stacking and heavy goods from 15kg.' },
    BC: { name: 'BC Flute, double wall', wall: 0.7, ect: '8.2 kN/m', use: 'Heavy duty work, fragile contents and export.' }
  };

  /* Pricing. Taken directly from Lothian Box Makers' own live Instant Price
     Calculator (lothianboxmakers.co.uk/calculator.html), read 22 August 2026.
     Same rates, same blank formula, same quantity tiers. Only B and BE are
     priced there; BC has no published rate, so it stays "call for a quote"
     exactly as his own calculator does. */
  var PRICE_RATES = { B: 0.369, BE: 0.540 };
  var PRICE_FIXED = 0.28;
  var SHEET_L = 2012, SHEET_W = 1000; /* mm, standard board sheet */

  /* Flat blank size in mm for an RSC box, from internal L/W/H in mm. */
  function blankSize(L, W, H) {
    return [2 * (L + W) + 67, 2 * H + 20];
  }

  function priceTier(q) {
    if (q < 50) return 2.2;
    if (q < 100) return 1.9;
    if (q < 250) return 1.7;
    if (q < 500) return 1.55;
    return 1.45;
  }

  /* internalCm: [L,W,H] in cm. Returns null if there is no published rate
     for this grade, or the blank will not fit a standard sheet. */
  function priceBox(internalCm, gradeKey, qty) {
    var rate = PRICE_RATES[gradeKey];
    if (!rate) return null;

    var mm = internalCm.map(function (n) { return n * 10; });
    var b = blankSize(mm[0], mm[1], mm[2]);
    if (b[0] > SHEET_L || b[1] > SHEET_W) return { oversize: true };

    var sqm = (b[0] * b[1]) / 1000000;
    var cost = sqm * rate + PRICE_FIXED;
    var each = Math.max(cost * priceTier(qty), 0.60);
    return { each: each, total: each * qty, oversize: false };
  }

  /* Royal Mail size formats. Dimensions in cm, weight in kg.
     Source: Royal Mail size guide, cross-checked against Priory Direct's
     published 2026 guide. Checked 21 August 2026. */
  var BANDS = [
    { name: 'Letter',         dims: [24, 16.5, 0.5], kg: 0.1 },
    { name: 'Large Letter',   dims: [35.3, 25, 2.5], kg: 0.75 },
    { name: 'Small Parcel',   dims: [45, 35, 16],    kg: 2 },
    { name: 'Medium Parcel',  dims: [61, 46, 46],    kg: 20 }
  ];

  function desc(a) { return a.slice().sort(function (x, y) { return y - x; }); }

  function fitsBandBySize(dims, band) {
    var d = desc(dims), b = desc(band.dims);
    return d[0] <= b[0] && d[1] <= b[1] && d[2] <= b[2];
  }

  /* How much has to come off each side to drop into a smaller band.
     Each entry keeps its sorted position so the caller can name the right
     side; a compacted list of bare numbers would mislabel them. */
  function shortfall(dims, band) {
    var d = desc(dims), b = desc(band.dims), over = [];
    for (var i = 0; i < 3; i++) {
      if (d[i] > b[i]) over.push({ idx: i, cm: round(d[i] - b[i]) });
    }
    return over;
  }

  /* Smallest external dimension this tool can actually produce: the fixed
     packing room, rounded the way internal sizes are, plus board on both
     faces. Bands thinner than this (Letter, Large Letter) are unreachable
     for a padded corrugated box, so they must never be suggested. */
  function bandIsReachable(band, wallCm) {
    var floor = roundUpHalf(PAD_CM) + wallCm * 2;
    return desc(band.dims)[2] >= floor;
  }

  function round(n) { return Math.round(n * 10) / 10; }
  function roundUpHalf(n) { return Math.ceil(n * 2) / 2; }
  function fmt(a) { return a.map(function (n) { return round(n); }).join(' x ') + ' cm'; }

  var form = $('#finderForm');
  var out = $('#resultBody');

  function fail(msg) {
    out.innerHTML = '<div class="result__err">' + msg + '</div>';
  }

  /* Packing room, held fixed rather than asked for. Matches the "Padded"
     default that used to be the pre-selected dropdown option. */
  var PAD_CM = 5;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var L = parseFloat($('#fL').value);
    var W = parseFloat($('#fW').value);
    var H = parseFloat($('#fH').value);
    var fragile = $('#fFragile').checked;
    var qty = parseInt($('#fQty').value, 10);

    if (!(L > 0) || !(W > 0) || !(H > 0)) {
      return fail('Put a number in all three size boxes first.');
    }
    if (L > 200 || W > 200 || H > 200) {
      return fail('That is bigger than this tool handles. Ring 07392 770606 and we will size it with you.');
    }
    if (!(qty > 0)) {
      return fail('Add how many boxes you need. Price depends on the quantity.');
    }
    /* The form is novalidate, so the max attribute is not enforced by the
       browser. Without this the panel will happily quote millions of boxes. */
    if (qty > 100000) {
      return fail('For runs over 100,000 boxes, ring 07392 770606 and we will price it properly.');
    }

    /* internal size, rounded up to the next half centimetre */
    var internal = [L + PAD_CM, W + PAD_CM, H + PAD_CM].map(roundUpHalf);

    /* BE (double wall) is the default grade, the same one flagged "most
       popular" on the board grades table. Fragile or export items step up
       to BC. Without a weight figure there is no reliable case for
       stepping down to single wall B, so B is not offered here. */
    var key = fragile ? 'BC' : 'BE';
    var grade = GRADES[key];

    /* external size adds the board thickness to both sides of each dimension */
    var external = internal.map(function (n) { return round(n + grade.wall * 2); });

    /* Which Royal Mail format the box lands in, by size alone. Every band
       also has a weight limit; that is surfaced as a note rather than
       checked, since the tool no longer asks for weight. */
    var band = null, bandIndex = -1;
    for (var i = 0; i < BANDS.length; i++) {
      if (fitsBandBySize(external, BANDS[i])) { band = BANDS[i]; bandIndex = i; break; }
    }

    var price = priceBox(internal, key, qty);

    var html = '<dl>';
    html += row('Internal size', fmt(internal), 'Your item plus ' + PAD_CM + 'cm of packing room in each dimension.');
    html += row('Outside size', fmt(external), 'Internal size plus ' + grade.wall * 10 + 'mm of board on each face.');
    html += row('Board we would use', grade.name, grade.use + ' Edge crush ' + grade.ect + '.');
    html += row('Quantity', qty.toLocaleString('en-GB') + ' boxes', 'No minimum order, so this number is fine either way.');

    if (price && !price.oversize) {
      html += row('Estimated price', '£' + price.each.toFixed(2) + ' each',
                   'Plus VAT. Plain brown board, collected from Livingston.');
      html += row('Estimated total', '£' + price.total.toFixed(2),
                   'Plus VAT. Confirmed by phone the same day once you send it.');
    }
    html += '</dl>';

    if (band) {
      html += '<div class="band"><strong>Royal Mail ' + band.name + '</strong>' +
              '<span>Limit ' + fmt(band.dims) + ' and ' + band.kg + 'kg. Your box fits the size limit; check the packed weight is under ' + band.kg + 'kg too.</span></div>';

      /* Can a smaller, cheaper format be reached on size alone? */
      var tip = '';
      for (var j = bandIndex - 1; j >= 0; j--) {
        var smaller = BANDS[j];
        if (!bandIsReachable(smaller, grade.wall)) continue;

        var over = shortfall(external, smaller);
        var worst = over.reduce(function (m, o) { return Math.max(m, o.cm); }, 0);
        if (over.length && worst <= 6) {
          var sides = ['longest side', 'second longest side', 'shortest side'];
          var parts = over.map(function (o) { return o.cm + 'cm off the ' + sides[o.idx]; });
          tip = 'Take ' + parts.join(', and ') + ', and the box drops to ' + smaller.name +
                ' on size (it would also need to weigh under ' + smaller.kg + 'kg). On a repeat order that is a saving on every parcel you send.';
          break;
        }
      }
      if (tip) {
        html += '<p class="result__note"><strong>Worth knowing.</strong> ' + tip + '</p>';
      }
    } else {
      html += '<div class="band"><strong>Bigger than a Medium Parcel</strong>' +
              '<span>Above 61 x 46 x 46 cm, so it goes by Parcelforce or a pallet carrier rather than standard Royal Mail.</span></div>';
    }

    var btnLabel = price && !price.oversize ? 'Send this quote for confirmation' : 'Send this spec for a price';
    html += '<button class="btn btn--navy btn--wide" type="button" id="sendSpec" style="margin-top:1.25rem">' + btnLabel + '</button>';

    var priceNote;
    if (price && price.oversize) {
      priceNote = 'This size is bigger than our standard board sheet, so it needs a special price. Send it through and we will come back to you.';
    } else if (!price) {
      priceNote = 'BC board is quoted by phone rather than by the calculator. Send the spec and we will call you with a price.';
    } else {
      priceNote = 'This is an estimate for plain brown board, the same figure our own instant calculator gives. Delivery is quoted separately. Send it and we confirm by phone the same day.';
    }

    html += '<p class="result__note">' + priceNote + ' Board figures and pricing are our own published specification, read from our live price calculator on 22 August 2026. ' +
            'Royal Mail size limits checked 21 August 2026 against the Royal Mail size guide. ' +
            'Courier limits change, so confirm the band before you commit to a big run.</p>';

    out.innerHTML = html;

    $('#sendSpec').addEventListener('click', function () {
      var msg = 'Box spec from the box finder\n\n' +
                'Item size: ' + fmt([L, W, H]) + '\n' +
                'Internal box size: ' + fmt(internal) + '\n' +
                'Outside box size: ' + fmt(external) + '\n' +
                'Board: ' + grade.name + '\n' +
                (fragile ? 'Fragile or export: yes\n' : '') +
                'Quantity: ' + qty + '\n' +
                'Royal Mail band (by size): ' + (band ? band.name : 'over Medium Parcel') + '\n' +
                (price && !price.oversize
                  ? 'Calculator estimate: £' + price.each.toFixed(2) + ' each, £' + price.total.toFixed(2) + ' total, plus VAT\n'
                  : '') +
                '\nPlease confirm this price.';

      var box = $('#qMsg');
      box.value = msg;
      document.getElementById('contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      window.setTimeout(function () { $('#qName').focus(); }, reduce ? 0 : 500);
    });
  });

  function row(label, value, note) {
    return '<div class="res-row"><dt>' + label + '</dt><dd>' + value +
           (note ? '<small>' + note + '</small>' : '') + '</dd></div>';
  }

  /* ================================================== quote form (Web3Forms) */

  var quote = $('#quoteForm');
  var quoteBtn = $('#quoteBtn');
  var formMsg = $('#formMsg');

  quote.addEventListener('submit', function (e) {
    e.preventDefault();

    formMsg.className = 'form__msg';
    formMsg.textContent = '';

    if (!quote.checkValidity()) {
      quote.reportValidity();
      return;
    }

    var original = quoteBtn.textContent;
    quoteBtn.textContent = 'Sending';
    quoteBtn.disabled = true;

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: new FormData(quote)
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        if (r.ok) {
          formMsg.className = 'form__msg is-ok';
          formMsg.textContent = 'Got it. We will come back to you with a price. If it is urgent, ring 07392 770606.';
          quote.reset();
        } else {
          formMsg.className = 'form__msg is-bad';
          formMsg.textContent = 'That did not send. ' + (r.data.message || '') + ' Please ring 07392 770606 or email sales@lothianboxmakers.co.uk.';
        }
      })
      .catch(function () {
        formMsg.className = 'form__msg is-bad';
        formMsg.textContent = 'That did not send. Please ring 07392 770606 or email sales@lothianboxmakers.co.uk.';
      })
      .then(function () {
        quoteBtn.textContent = original;
        quoteBtn.disabled = false;
      });
  });

})();
