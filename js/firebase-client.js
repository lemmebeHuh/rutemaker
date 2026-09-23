import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyApNJ4cnYHej55HYX_aCoian_8dJZJBLFs",
  authDomain: "kala-males.firebaseapp.com",
  projectId: "kala-males",
  storageBucket: "kala-males.firebasestorage.app",
  messagingSenderId: "545716143530",
  appId: "1:545716143530:web:55499f2706bbffe5c857d3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.FirebaseClient = {
  saveActivity: async (name, state) => {
    try {
      // Compress trackpoints by keeping only essential keys to stay well under 1MB Firestore limit
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

      const docRef = await addDoc(collection(db, "activities"), {
        name: name || 'Unnamed Activity',
        sport: state.sport,
        distance: state.stats ? state.stats.distanceKm : 0,
        timeSec: state.stats ? state.stats.movingTimeSec : 0,
        createdAt: serverTimestamp(),
        tpsStr: JSON.stringify(minifiedTps)
      });
      return docRef.id;
    } catch (e) {
      console.error("Error saving to Firebase: ", e);
      throw e;
    }
  },

  listActivities: async () => {
    try {
      const q = query(collection(db, "activities"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
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
      console.error("Error listing from Firebase: ", e);
      throw e;
    }
  },

  getActivity: async (id) => {
    try {
      const docRef = doc(db, "activities", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const minifiedTps = JSON.parse(data.tpsStr);
        // Reconstruct full trackpoints
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
      console.error("Error getting activity from Firebase: ", e);
      throw e;
    }
  },

  deleteActivity: async (id) => {
    try {
      await deleteDoc(doc(db, "activities", id));
    } catch (e) {
      console.error("Error deleting from Firebase: ", e);
      throw e;
    }
  }
};
console.log("FirebaseClient initialized.");
