const firebaseConfig = {
  apiKey: "AIzaSyApNJ4cnYHej55HYX_aCoian_8dJZJBLFs",
  authDomain: "kala-males.firebaseapp.com",
  projectId: "kala-males",
  storageBucket: "kala-males.firebasestorage.app",
  messagingSenderId: "545716143530",
  appId: "1:545716143530:web:55499f2706bbffe5c857d3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

window.FirebaseClient = {
  saveActivity: async (name, state) => {
    try {
      const minifiedTps = state.lastGeneratedTps.map(tp => {
        const minTp = { 
          t: tp.time, 
          lt: tp.position ? tp.position.latitudeDegrees : null,
          ln: tp.position ? tp.position.longitudeDegrees : null,
          a: tp.altitudeMeters,
          s: tp.speed,
          d: tp.distanceMeters 
        };
        if (tp.heartRateBpm) minTp.hr = tp.heartRateBpm;
        if (tp.cadence) minTp.cad = tp.cadence;
        if (tp.power) minTp.p = tp.power;
        return minTp;
      });

      const docRef = await db.collection("activities").add({
        name: name || 'Unnamed Activity',
        sport: state.sport,
        distance: state.stats ? state.stats.distanceKm : 0,
        timeSec: state.stats ? state.stats.movingTimeSec : 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        tpsStr: JSON.stringify(minifiedTps)
      });
      return docRef.id;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  listActivities: async () => {
    try {
      const snapshot = await db.collection("activities").orderBy("createdAt", "desc").get();
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name,
          sport: data.sport,
          distance: data.distance,
          timeSec: data.timeSec,
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
        });
      });
      return list;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  getActivity: async (id) => {
    try {
      const docRef = db.collection("activities").doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        const minifiedTps = JSON.parse(data.tpsStr);
        const fullTps = minifiedTps.map(minTp => {
          const tp = {
            time: minTp.t,
            altitudeMeters: minTp.a,
            speed: minTp.s,
            distanceMeters: minTp.d
          };
          if (minTp.lt !== null && minTp.ln !== null) {
            tp.position = { latitudeDegrees: minTp.lt, longitudeDegrees: minTp.ln };
          }
          if (minTp.hr) tp.heartRateBpm = minTp.hr;
          if (minTp.cad) tp.cadence = minTp.cad;
          if (minTp.p) tp.power = minTp.p;
          return tp;
        });
        return {
          id: docSnap.id,
          name: data.name,
          sport: data.sport,
          tps: fullTps
        };
      }
      return null;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  deleteActivity: async (id) => {
    try {
      await db.collection("activities").doc(id).delete();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
};
console.log("FirebaseClient initialized via compat API.");
