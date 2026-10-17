/* =========================================================================
   Lothian Box Makers
   Last reviewed 15 October 2026.

   WHAT CHANGED AND WHY (read before editing):

   1. Blank formula is grade-aware and machine-verified.
      B and BE (3mm / 5mm):  length = 2*(L+W) + 67,  width = W + H + 20
      BC (7mm):              length = 2*(L+W) + 75,  width = W + H + 28
      The BE figures were read directly off the BM100 on 13 Oct 2026
      (500/470/470 at 5mm board, 50mm glue flap -> 2007 x 960). Do not
      change these without a fresh machine reading. Earlier versions used
      2*H + 20 for the width, which is only correct when W equals H, and
      that error caused real under-quoting.

   2. Cost is driven by boxes per sheet, not blank area. A whole sheet is
      consumed whether or not it is filled, so the cost of a box is the
      sheet price divided by how many blanks fit on it.

   3. Real sheet stock. SHEETS lists the sizes actually held, per grade.
      The tool will never pick a sheet that is not stocked in that grade.
      EDIT THIS LIST WHEN STOCK CHANGES.

   4. Trim feasibility. The slitter cannot take a narrow strip off a sheet,
      so a layout is only offered if the waste on each axis is either
      negligible (under TOL_MM, run as-is) or wide enough to cut
      (MIN_TRIM_MM or more).

   5. BC is not quoted. Stock is about 10 sheets, nowhere near production,
      so a fragile or export job is now priced in BE with a note, rather
      than quoting a board that cannot be supplied.

   6. All six box orientations are tried and the cheapest workable one is
      used. Turning a box on the machine can halve the board it needs.
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

  if (themeBtn) {
    applyTheme(root.getAttribute('data-theme') || 'light');

    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('lbm-theme', next); } catch (e) {}
    });
  }

  /* --------------------------------------------------------------- nav */

  var navBtn = $('#navToggle');
  var nav = $('#nav');

  if (navBtn && nav) {
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
  }

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

  var topbar = document.querySelector('.topbar');
  var heroSection = document.querySelector('.hero');
  var brandLink = document.querySelector('.brand');

  if (topbar && heroSection && 'IntersectionObserver' in window) {
    var brandIo = new IntersectionObserver(function (entries) {
      var past = !entries[0].isIntersecting;
      topbar.classList.toggle('is-scrolled', past);
      if (brandLink) brandLink.setAttribute('tabindex', past ? '0' : '-1');
    }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 });

    brandIo.observe(heroSection);
  }

  /* ================================================== box finder logic */

  /* ---- board grades. wall = board thickness in cm, both faces. ------- */
  var GRADES = {
    B:  { name: 'B Flute, single wall',  wall: 0.3, ect: '5.2 kN/m',
          use: 'Postal, retail and light goods up to about 10kg.' },
    BE: { name: 'BE Flute, double wall', wall: 0.5, ect: '8.7 kN/m',
          use: 'Moving, stacking and heavy goods from 15kg.' },
    BC: { name: 'BC Flute, double wall', wall: 0.7, ect: '8.2 kN/m',
          use: 'Heavy duty work, fragile contents and export.' }
  };

  /* ---- board cost, pounds per square metre of sheet ------------------ */
  var RATES = { B: 0.369, BE: 0.540, BC: 0.682 };

  /* ---- fixed cost per box: glue, labour, overhead -------------------- */
  /* ESTIMATE. Never validated against a timed production batch. Doing
     that is the single biggest accuracy win available to this tool. */
  var FIXED_PER_BOX = 0.28;

  /* ---- sheets actually held, with the grades each comes in ----------- */
  /* EDIT WHEN STOCK CHANGES. A grade missing from a sheet means the tool
     will not use that sheet for that grade. BC is listed for completeness
     but is not quoted (see QUOTABLE below). */
  var SHEETS = [
    { l: 1212, w: 750,  grades: ['B'] },
    { l: 1412, w: 750,  grades: ['B'] },
    { l: 1812, w: 850,  grades: ['B'] },
    { l: 1812, w: 1000, grades: ['B'] },
    { l: 2012, w: 1000, grades: ['B', 'BE'] },
    { l: 2352, w: 1160, grades: ['BC'] }
  ];

  /* Grades we will put a price against. BC stock is about 10 sheets, so a
     BC price would be a promise we cannot keep. Add 'BC' here once a real
     board order lands. */
  var QUOTABLE = { B: true, BE: true };

  /* ---- slitter feasibility ------------------------------------------- */
  /* Waste on an axis must be either small enough to ignore (run the sheet
     as it is) or wide enough to actually cut off. Anything between is a
     strip the slitter cannot take. */
  var TOL_MM = 5;        /* run as-is up to this much excess */
  var MIN_TRIM_MM = 25;  /* narrowest strip the slitter will cut */

  /* ---- machine size cap, in mm --------------------------------------- */
  var MAX_LW_MM = 972;
  var MAX_WH_MM = 980;

  /* ---- quantity multipliers ------------------------------------------ */
  function priceTier(q) {
    if (q < 50) return 2.2;
    if (q < 100) return 1.9;
    if (q < 250) return 1.7;
    if (q < 500) return 1.55;
    return 1.45;
  }

  var FLOOR_PRICE = 0.60;

  /* Flat blank, in mm, for an RSC from internal L/W/H in mm.
     See the note at the top of this file before touching these numbers. */
  function blankSize(L, W, H, gradeKey) {
    if (gradeKey === 'BC') return [2 * (L + W) + 75, W + H + 28];
    return [2 * (L + W) + 67, W + H + 20];
  }

  /* Can this many blanks of length `b` sit along a sheet edge of `s`,
     leaving waste the slitter can handle? Returns the count, or 0. */
  function fitAlong(s, b) {
    var n = Math.floor(s / b);
    /* allow a blank marginally longer than the sheet: within tolerance the
       sheet runs as it is, which is how 2007 on a 2012 sheet works */
    if (n === 0 && b - s <= TOL_MM) n = 1;
    if (n < 1) return 0;
    var waste = s - n * b;
    if (waste <= TOL_MM) return n;          /* no cut needed */
    if (waste >= MIN_TRIM_MM) return n;     /* cuttable */
    /* waste is an uncuttable strip: drop a blank and re-check */
    n -= 1;
    if (n < 1) return 0;
    waste = s - n * b;
    return waste >= MIN_TRIM_MM ? n : 0;
  }

  /* All six orderings of the three sides. A box can be turned on the
     machine, so each ordering is a genuine option. */
  var ORIENTATIONS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];

  function withinCap(l, w, h) {
    return (l + w <= MAX_LW_MM) && (w + h <= MAX_WH_MM);
  }

  /* Does any orientation clear the machine cap? */
  function fitsCap(mm) {
    for (var i = 0; i < ORIENTATIONS.length; i++) {
      var o = ORIENTATIONS[i];
      if (withinCap(mm[o[0]], mm[o[1]], mm[o[2]])) return true;
    }
    return false;
  }

  /* Smallest amount, in mm, that must come off before some ordering fits.
     Used only to word the error message. */
  function capOverage(mm) {
    var best = Infinity;
    for (var i = 0; i < ORIENTATIONS.length; i++) {
      var o = ORIENTATIONS[i];
      var l = mm[o[0]], w = mm[o[1]], h = mm[o[2]];
      var over = Math.max(0, l + w - MAX_LW_MM, w + h - MAX_WH_MM);
      if (over < best) best = over;
    }
    return Math.round(best);
  }

  /* Cheapest workable way to make this box in this grade.
     Tries every orientation that clears the cap, against every stocked
     sheet, in both rotations. Returns the winning layout or null. */
  function bestLayout(mm, gradeKey) {
    var rate = RATES[gradeKey];
    if (!rate) return null;

    var best = null;

    for (var i = 0; i < ORIENTATIONS.length; i++) {
      var o = ORIENTATIONS[i];
      var L = mm[o[0]], W = mm[o[1]], H = mm[o[2]];
      if (!withinCap(L, W, H)) continue;

      var b = blankSize(L, W, H, gradeKey);

      for (var s = 0; s < SHEETS.length; s++) {
        var sheet = SHEETS[s];
        if (sheet.grades.indexOf(gradeKey) === -1) continue;

        /* blank laid out either way round on the sheet */
        var layouts = [
          fitAlong(sheet.l, b[0]) * fitAlong(sheet.w, b[1]),
          fitAlong(sheet.l, b[1]) * fitAlong(sheet.w, b[0])
        ];
        var per = Math.max(layouts[0], layouts[1]);
        if (per < 1) continue;

        var sheetSqm = (sheet.l * sheet.w) / 1000000;
        var boardCost = (sheetSqm * rate) / per;
        var cost = boardCost + FIXED_PER_BOX;

        if (!best || cost < best.cost) {
          best = {
            cost: cost,
            perSheet: per,
            sheet: sheet,
            blank: b,
            order: [L, W, H]
          };
        }
      }
    }

    return best;
  }

  function priceFor(mm, gradeKey, qty) {
    if (!QUOTABLE[gradeKey]) return { unquotable: true };
    var lay = bestLayout(mm, gradeKey);
    if (!lay) return { nofit: true };
    var each = Math.max(lay.cost * priceTier(qty), FLOOR_PRICE);
    return { each: each, total: each * qty, layout: lay };
  }

  /* ---- Royal Mail size formats. cm, and kg. ------------------------- */
  var BANDS = [
    { name: 'Letter',        dims: [24, 16.5, 0.5], kg: 0.1 },
    { name: 'Large Letter',  dims: [35.3, 25, 2.5], kg: 0.75 },
    { name: 'Small Parcel',  dims: [45, 35, 16],    kg: 2 },
    { name: 'Medium Parcel', dims: [61, 46, 46],    kg: 20 }
  ];

  function desc(a) { return a.slice().sort(function (x, y) { return y - x; }); }

  function fitsBandBySize(dims, band) {
    var d = desc(dims), b = desc(band.dims);
    return d[0] <= b[0] && d[1] <= b[1] && d[2] <= b[2];
  }

  function shortfall(dims, band) {
    var d = desc(dims), b = desc(band.dims), over = [];
    for (var i = 0; i < 3; i++) {
      if (d[i] > b[i]) over.push({ idx: i, cm: round(d[i] - b[i]) });
    }
    return over;
  }

  function bandIsReachable(band, wallCm) {
    var floor = roundUpHalf(PAD_CM) + wallCm * 2;
    return desc(band.dims)[2] >= floor;
  }

  function round(n) { return Math.round(n * 10) / 10; }
  function roundUpHalf(n) { return Math.ceil(n * 2) / 2; }
  function fmt(a) { return a.map(function (n) { return round(n); }).join(' x ') + ' cm'; }
  function fmtMm(a) { return a.map(function (n) { return Math.round(n); }).join(' x ') + 'mm'; }

  var form = $('#finderForm');
  var out = $('#resultBody');

  function fail(msg) {
    out.innerHTML = '<div class="result__err">' + msg + '</div>';
  }

  /* Packing room allowed around the item, in cm. */
  var PAD_CM = 5;

  function row(label, value, note) {
    return '<div class="res-row"><dt>' + label + '</dt><dd>' + value +
           (note ? '<small>' + note + '</small>' : '') + '</dd></div>';
  }

  if (form && out) form.addEventListener('submit', function (e) {
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
    if (qty > 100000) {
      return fail('For runs over 100,000 boxes, ring 07392 770606 and we will price it properly.');
    }

    /* internal size: item plus packing room, up to the next half cm */
    var internal = [L + PAD_CM, W + PAD_CM, H + PAD_CM].map(roundUpHalf);
    var mm = internal.map(function (n) { return n * 10; });

    if (!fitsCap(mm)) {
      return fail('That box is past our machine limit. A finished box has to keep ' +
                  'length + width under 972mm and width + height under 980mm. With ' +
                  PAD_CM + 'cm of packing room yours comes out ' + fmt(internal) +
                  ', about ' + capOverage(mm) + 'mm too big. Ring 07392 770606 — there ' +
                  'are other box styles that handle long or deep items, and we will size it with you.');
    }

    /* BE double wall is the working default. A fragile or export job would
       ideally step up to BC, but BC is not in stock, so it stays BE and
       the note says so rather than quoting a board we cannot supply. */
    var key = 'BE';
    var grade = GRADES[key];

    var external = internal.map(function (n) { return round(n + grade.wall * 2); });

    var band = null, bandIndex = -1;
    for (var i = 0; i < BANDS.length; i++) {
      if (fitsBandBySize(external, BANDS[i])) { band = BANDS[i]; bandIndex = i; break; }
    }

    var price = priceFor(mm, key, qty);

    /* single wall alternative, offered when it is cheaper and the job is
       not fragile or for export */
    var alt = null;
    if (!fragile) {
      var altPrice = priceFor(mm, 'B', qty);
      if (altPrice && altPrice.each && price.each && altPrice.each < price.each - 0.01) {
        alt = altPrice;
      }
    }

    var html = '<dl>';
    html += row('Internal size', fmt(internal),
                'Your item plus ' + PAD_CM + 'cm of packing room in each dimension.');
    html += row('Outside size', fmt(external),
                'Internal size plus ' + grade.wall * 10 + 'mm of board on each face.');
    html += row('Board we would use', grade.name,
                grade.use + ' Edge crush ' + grade.ect + '.');
    html += row('Quantity', qty.toLocaleString('en-GB') + ' boxes',
                'No minimum order, so this number is fine either way.');

    if (price.each) {
      html += row('Estimated price', '&pound;' + price.each.toFixed(2) + ' each',
                  'Plus VAT. Plain brown board, collected from Livingston.');
      html += row('Estimated total', '&pound;' + price.total.toFixed(2),
                  'Plus VAT. Confirmed by phone the same day once you send it.');
    }

    if (alt) {
      html += row('Single wall instead', '&pound;' + alt.each.toFixed(2) + ' each',
                  'B Flute, 3mm. Cheaper, and fine for lighter goods up to about 10kg. ' +
                  'Tell us the weight and we will say which one you actually need.');
    }

    html += '</dl>';

    if (band) {
      html += '<div class="band"><strong>Royal Mail ' + band.name + '</strong>' +
              '<span>Limit ' + fmt(band.dims) + ' and ' + band.kg + 'kg. Your box fits the size limit; ' +
              'check the packed weight is under ' + band.kg + 'kg too.</span></div>';

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
                ' on size (it would also need to weigh under ' + smaller.kg + 'kg). ' +
                'On a repeat order that is a saving on every parcel you send.';
          break;
        }
      }
      if (tip) html += '<p class="result__note"><strong>Worth knowing.</strong> ' + tip + '</p>';
    } else {
      html += '<div class="band"><strong>Bigger than a Medium Parcel</strong>' +
              '<span>Above 61 x 46 x 46 cm, so it goes by Parcelforce or a pallet carrier ' +
              'rather than standard Royal Mail.</span></div>';
    }

    var btnLabel = price.each ? 'Send this quote for confirmation' : 'Send this spec for a price';
    html += '<button class="btn btn--navy btn--wide" type="button" id="sendSpec" ' +
            'style="margin-top:1.25rem">' + btnLabel + '</button>';

    var note;
    if (price.nofit) {
      note = 'This size does not lay out economically on the board we stock, so it needs ' +
             'pricing by hand. Send it through and we will come back to you the same day.';
    } else if (fragile) {
      note = 'You have marked this fragile or for export. We would normally suggest BC flute ' +
             'at 7mm for that, but we are between board orders on BC, so the price above is ' +
             'BE double wall at 5mm. For most fragile work BE is the right board anyway — ' +
             'what protects the contents is packing the gaps out, not the extra 2mm of wall. ' +
             'Send the spec and we will tell you honestly which you need.';
    } else {
      note = 'This is an estimate for plain brown board. Delivery is quoted separately, and is ' +
             'free within 20 miles of Livingston. Send it and we confirm by phone the same day.';
    }

    html += '<p class="result__note">' + note + ' Royal Mail size limits checked against the ' +
            'Royal Mail size guide; courier limits change, so confirm the band before you ' +
            'commit to a big run.</p>';

    out.innerHTML = html;

    $('#sendSpec').addEventListener('click', function () {
      var lay = price.layout;
      var msg = 'Box spec from the box finder\n\n' +
                'Item size: ' + fmt([L, W, H]) + '\n' +
                'Internal box size: ' + fmt(internal) + '\n' +
                'Outside box size: ' + fmt(external) + '\n' +
                'Board: ' + grade.name + '\n' +
                (fragile ? 'Fragile or export: yes (BC not in stock, quoted in BE)\n' : '') +
                'Quantity: ' + qty + '\n' +
                'Royal Mail band (by size): ' + (band ? band.name : 'over Medium Parcel') + '\n' +
                (price.each
                  ? 'Calculator estimate: £' + price.each.toFixed(2) + ' each, £' +
                    price.total.toFixed(2) + ' total, plus VAT\n'
                  : '') +
                (alt ? 'Single wall option: £' + alt.each.toFixed(2) + ' each, plus VAT\n' : '') +
                (lay
                  ? '\n-- for the workshop --\n' +
                    'Machine input L/W/H: ' + lay.order.join(' / ') + 'mm\n' +
                    'Blank: ' + fmtMm(lay.blank) + '\n' +
                    'Sheet: ' + lay.sheet.l + ' x ' + lay.sheet.w + 'mm, ' +
                    lay.perSheet + ' per sheet\n'
                  : '') +
                '\nPlease confirm this price.';

      var box = $('#qMsg');
      box.value = msg;
      document.getElementById('contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      window.setTimeout(function () { $('#qName').focus(); }, reduce ? 0 : 500);
    });
  });

  /* ================================================== quote form (Web3Forms) */

  var quote = $('#quoteForm');
  var quoteBtn = $('#quoteBtn');
  var formMsg = $('#formMsg');

  if (quote && quoteBtn && formMsg) quote.addEventListener('submit', function (e) {
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
          formMsg.textContent = 'That did not send. ' + (r.data.message || '') +
                                ' Please ring 07392 770606 or email sales@lothianboxmakers.co.uk.';
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
