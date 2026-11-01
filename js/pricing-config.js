/**
 * midrunners - Centralized Pricing Configuration
 * Single Activity & Promo Package Pricing Engine
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PRICING_CONFIG = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  const PRICING_CONFIG = {
    // 1. Base Pricing
    basePricing: {
      presets: [
        { distance: 5, label: '5 KM', price: 35000 },
        { distance: 10, label: '10 KM', price: 70000 },
        { distance: 21, label: '21 KM (HM)', price: 100000 },
        { distance: 42, label: '42 KM (FM)', price: 150000 }
      ],
      getBasePrice: function(distance) {
        const d = parseFloat(distance) || 5;
        if (d === 5) return 35000;
        if (d === 10) return 70000;
        if (d === 21) return 100000;
        if (d === 42) return 150000;

        // Pro-rated / tier interpolation for custom distance input
        if (d < 5) return 35000;
        if (d < 10) {
          return 35000 + Math.round((d - 5) * 7000); // 35k at 5km -> 70k at 10km (7k/km)
        }
        if (d < 21) {
          const rate = (100000 - 70000) / 11; // 70k at 10km -> 100k at 21km (~2.727/km)
          return 70000 + Math.round((d - 10) * rate);
        }
        if (d < 42) {
          const rate = (150000 - 100000) / 21; // 100k at 21km -> 150k at 42km (~2.381/km)
          return 100000 + Math.round((d - 21) * rate);
        }
        // > 42 KM: 150k + 3.000/km
        return 150000 + Math.round((d - 42) * 3000);
      }
    },

    // 2. Pace-based pricing
    // Format: mm:ss /km
    // > 5:50/km (> 350s): Gratis
    // 5:00 - 5:50/km (300s - 350s): +Rp 20.000
    // 4:01 - 4:59/km (241s - 299s): +Rp 20.000
    // <= 4:00/km (<= 240s): +Rp 40.000
    pacePricing: {
      getPaceFee: function(paceSeconds, sport) {
        if (sport === 'Sepeda') return 0;
        const s = parseInt(paceSeconds) || 330;
        if (s <= 240) {
          return 40000; // <= 4:00/km
        } else if (s <= 299) {
          return 20000; // 4:01 - 4:59/km
        } else if (s <= 350) {
          return 20000; // 5:00 - 5:50/km
        } else {
          return 0; // > 5:50/km
        }
      },
      getPaceTierLabel: function(paceSeconds, sport) {
        if (sport === 'Sepeda') return 'Kecepatan Sepeda Standar';
        const s = parseInt(paceSeconds) || 330;
        if (s <= 240) return '≤ 4:00 /km (+Rp 40.000)';
        if (s <= 299) return '4:01–4:59 /km (+Rp 20.000)';
        if (s <= 350) return '5:00–5:50 /km (+Rp 20.000)';
        return '> 5:50 /km (Gratis)';
      }
    },

    // 3. Heart Rate Rules
    // - Pace > 5:50/km: HR optional (+Rp 5.000)
    // - Pace <= 5:00/km: HR included free (+Rp 0)
    // - Pace 5:01 - 5:50/km: Configurable via admin settings (default: 5000)
    heartRate: {
      getMidPaceRule: function() {
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('midrunners_admin_pricing');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.hrRuleMidPace) {
                return parsed.hrRuleMidPace; // 'free' or '5000'
              }
            }
          }
        } catch (e) {
          console.warn('Could not read admin HR config', e);
        }
        return '5000'; // Default
      },
      getHrInfo: function(paceSeconds, sport, hrSelected, deviceSupportsHr) {
        if (!deviceSupportsHr) {
          return {
            available: false,
            included: false,
            fee: 0,
            statusText: 'Tidak Tersedia',
            userOption: 'Tidak Tersedia'
          };
        }

        const s = parseInt(paceSeconds) || 330;
        
        // Pace <= 5:00/km (<= 300s): HR is automatically included without extra fee
        if (sport !== 'Sepeda' && s <= 300) {
          return {
            available: true,
            included: true,
            fee: 0,
            statusText: 'Termasuk (Gratis)',
            userOption: hrSelected ? 'Ya (Termasuk / Free)' : 'Tidak Dipakai'
          };
        }

        // Pace 5:01–5:50/km (301s - 350s): Admin configurable
        if (sport !== 'Sepeda' && s > 300 && s <= 350) {
          const rule = this.getMidPaceRule();
          if (rule === 'free') {
            return {
              available: true,
              included: true,
              fee: 0,
              statusText: 'Termasuk (Promo)',
              userOption: hrSelected ? 'Ya (Termasuk Promo)' : 'Tidak Dipakai'
            };
          } else {
            return {
              available: true,
              included: false,
              fee: hrSelected ? 5000 : 0,
              statusText: hrSelected ? '+Rp 5.000' : 'Rp 0',
              userOption: hrSelected ? 'Ya (+Rp 5.000)' : 'Tidak Dipakai'
            };
          }
        }

        // Pace > 5:50/km (> 350s) or Sepeda:
        return {
          available: true,
          included: false,
          fee: hrSelected ? 5000 : 0,
          statusText: hrSelected ? '+Rp 5.000' : 'Rp 0',
          userOption: hrSelected ? 'Ya (+Rp 5.000)' : 'Tidak Dipakai'
        };
      }
    },

    // 4. Smartwatch Selection
    devices: [
      { id: 'garmin_forerunner_945', name: 'Garmin Forerunner 945', brand: 'Garmin', hasHr: true },
      { id: 'garmin_forerunner_245', name: 'Garmin Forerunner 245', brand: 'Garmin', hasHr: true },
      { id: 'garmin_forerunner_165', name: 'Garmin Forerunner 165', brand: 'Garmin', hasHr: true },
      { id: 'garmin_fenix_7', name: 'Garmin Fenix 7', brand: 'Garmin', hasHr: true },
      { id: 'garmin_epix_gen2', name: 'Garmin Epix Gen 2', brand: 'Garmin', hasHr: true },
      { id: 'coros_pace_2', name: 'COROS PACE 2', brand: 'COROS', hasHr: true },
      { id: 'coros_pace_3', name: 'COROS PACE 3', brand: 'COROS', hasHr: true },
      { id: 'coros_apex_pro_2', name: 'COROS APEX Pro 2', brand: 'COROS', hasHr: true },
      { id: 'apple_watch_ultra', name: 'Apple Watch Ultra', brand: 'Apple', hasHr: true },
      { id: 'apple_watch_s8', name: 'Apple Watch Series 8', brand: 'Apple', hasHr: true },
      { id: 'huawei_watch_gt3', name: 'HUAWEI WATCH GT 3', brand: 'Huawei', hasHr: true },
      { id: 'huawei_watch_fit', name: 'HUAWEI WATCH FIT', brand: 'Huawei', hasHr: true }
    ],

    // 5. Promo Paket Aktivitas
    packagePricing: {
      packages: [
        { count: 3, normalPrice: 150000, promoPrice: 150000, pricePerActivity: 50000, label: '3 Aktivitas' },
        { count: 5, normalPrice: 250000, promoPrice: 200000, pricePerActivity: 40000, label: '5 Aktivitas' },
        { count: 10, normalPrice: 500000, promoPrice: 350000, pricePerActivity: 35000, label: '10 Aktivitas' },
        { count: 15, normalPrice: 750000, promoPrice: 480000, pricePerActivity: 32000, label: '15 Aktivitas' },
        { count: 20, normalPrice: 1000000, promoPrice: 600000, pricePerActivity: 30000, label: '20 Aktivitas' },
        { count: 30, normalPrice: 1500000, promoPrice: 780000, pricePerActivity: 26000, label: '30 Aktivitas' }
      ],
      benefits: [
        'Bebas request pace.',
        'Termasuk data Heart Rate (HR).',
        'Bebas menentukan jarak aktivitas hingga maksimal 21 KM per aktivitas.',
        'Tidak dikenakan biaya tambahan untuk request pace maupun HR.'
      ],
      terms: [
        'Batas jarak adalah maksimal 21 KM untuk setiap aktivitas.',
        'Jika membutuhkan jarak lebih dari 21 KM, biaya tambahan mengikuti ketentuan harga jarak yang berlaku.',
        'Harga paket merupakan harga promo dan berlaku sesuai jumlah aktivitas yang dipilih.',
        'Jangan menghitung biaya add-on pace dan HR secara terpisah untuk pemesanan paket karena keduanya sudah termasuk.'
      ],
      getPackage: function(count) {
        const c = parseInt(count) || 5;
        return this.packages.find(p => p.count === c) || this.packages[1];
      }
    },

    // 6. Consolidated Calculator (Single Activity)
    calculate: function(params) {
      const distance = parseFloat(params.distance) || 5;
      const paceSeconds = parseInt(params.paceSeconds) || 330;
      const sport = params.sport || 'Lari';
      const hrWanted = Boolean(params.hrWanted);
      const deviceId = params.deviceId || 'garmin_forerunner_245';

      const device = this.devices.find(d => d.id === deviceId) || this.devices[0];
      const deviceSupportsHr = Boolean(device && device.hasHr);

      const basePrice = this.basePricing.getBasePrice(distance);
      const paceFee = this.pacePricing.getPaceFee(paceSeconds, sport);
      const paceTierLabel = this.pacePricing.getPaceTierLabel(paceSeconds, sport);

      const hrInfo = this.heartRate.getHrInfo(paceSeconds, sport, hrWanted, deviceSupportsHr);

      const totalPrice = basePrice + paceFee + hrInfo.fee;

      const formatRp = (num) => 'Rp ' + Number(num).toLocaleString('id-ID');

      // Format pace string mm:ss /km
      let paceStr = '';
      if (sport === 'Sepeda') {
        paceStr = paceSeconds + ' km/h';
      } else {
        const m = Math.floor(paceSeconds / 60);
        const s = (paceSeconds % 60).toString().padStart(2, '0');
        paceStr = `${m}:${s} /km`;
      }

      return {
        distance: distance,
        distanceStr: `${distance} KM`,
        basePrice: basePrice,
        basePriceFormatted: formatRp(basePrice),

        sport: sport,
        paceSeconds: paceSeconds,
        paceStr: paceStr,
        paceFee: paceFee,
        paceFeeFormatted: formatRp(paceFee),
        paceTierLabel: paceTierLabel,

        device: device,
        deviceSupportsHr: deviceSupportsHr,
        hrSelected: hrWanted && deviceSupportsHr,
        hrFee: hrInfo.fee,
        hrFeeFormatted: formatRp(hrInfo.fee),
        hrIncluded: hrInfo.included,
        hrStatusText: hrInfo.statusText,
        hrUserOption: hrInfo.userOption,

        totalPrice: totalPrice,
        totalPriceFormatted: formatRp(totalPrice)
      };
    }
  };

  return PRICING_CONFIG;
}));
