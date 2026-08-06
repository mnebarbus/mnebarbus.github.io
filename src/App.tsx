"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { outboundRoute, reverseRoute } from "./route-data";

type Stop = { name: string; offset: number; lat: number; lng: number; reverseLat?: number; reverseLng?: number; outbound?: boolean; reverse?: boolean };
type Trip = { time: number; service: "Čanj" | "Sutomore" };
type Direction = "outbound" | "reverse";

// Coordinates and stop order from WikiRoutes route 53424.
const stops: Stop[] = [
  { name: "Stari Bar", offset: 0, lat: 42.0921605, lng: 19.1327546, reverseLat: 42.0921605, reverseLng: 19.1327546 },
  { name: "Opšta bolnica", offset: 3, lat: 42.088374, lng: 19.1307591, reverseLat: 42.088374, reverseLng: 19.1307591 },
  { name: "Rena", offset: 7, lat: 42.0924832, lng: 19.1187855, reverseLat: 42.0923325, reverseLng: 19.1189185 },
  { name: "Popovići", offset: 10, lat: 42.0926257, lng: 19.1123727, reverseLat: 42.0925402, reverseLng: 19.1124317 },
  { name: "Distribucija", offset: 13, lat: 42.0930676, lng: 19.1042536, reverseLat: 42.0928925, reverseLng: 19.1042268 },
  { name: "Željeznička stanica", offset: 16, lat: 42.0877619, lng: 19.1035905, reverseLat: 42.0877619, reverseLng: 19.1035905 },
  { name: "Novi bulevar", offset: 19, lat: 42.0939998, lng: 19.0975139, reverseLat: 42.0939235, reverseLng: 19.0964453 },
  { name: "Jovana Tomaševića", offset: 21, lat: 42.096127, lng: 19.0963905, reverseLat: 42.0971466, reverseLng: 19.0954536 },
  { name: "Bulevar Revolucije", offset: 23, lat: 42.1020957, lng: 19.0999943, reverseLat: 42.1018831, reverseLng: 19.1003444 },
  { name: "Hram", offset: 25, lat: 42.1021688, lng: 19.0938467, reverseLat: 42.1019857, reverseLng: 19.0938601 },
  { name: "Stadion", offset: 27, lat: 42.1058221, lng: 19.0912561, reverseLat: 42.105741, reverseLng: 19.0910204 },
  { name: "Šušanj", offset: 29, lat: 42.1104908, lng: 19.0885854, reverseLat: 42.1109856, reverseLng: 19.0870115 },
  { name: "Sv. Andrija", offset: 33, lat: 42.1349506, lng: 19.0638666, reverse: false },
  { name: "Villa Jagoda", offset: 33, lat: 42.1329473, lng: 19.0630032, outbound: false, reverse: true },
  { name: "Sutomore", offset: 38, lat: 42.1416346, lng: 19.0476687, reverseLat: 42.1409449, reverseLng: 19.0482098 },
  { name: "Haj-Nehaj", offset: 43, lat: 42.1575384, lng: 19.0293253, reverseLat: 42.1573108, reverseLng: 19.0293866 },
  { name: "Đurmani", offset: 47, lat: 42.1634345, lng: 19.0186065, reverseLat: 42.1632055, reverseLng: 19.018484 },
  { name: "Mišići", offset: 50, lat: 42.1665011, lng: 19.0128033, reverseLat: 42.1665053, reverseLng: 19.0122854 },
  { name: "Čanj", offset: 55, lat: 42.159921, lng: 19.0034002, reverseLat: 42.159921, reverseLng: 19.0034002 },
];
const alphabeticStops = [...stops].sort((a,b) => a.name.localeCompare(b.name, "sr-Latn-ME"));

type StopPoint = { id:number; stop:Stop; direction:Direction | null };
const stopPoints: StopPoint[] = stops.flatMap((stop, index) => {
  const canOutbound = stop.offset < 55 && stop.outbound !== false;
  const canReverse = stop.offset > 0 && stop.reverse !== false;
  const shared = canOutbound && canReverse && stop.reverseLat === stop.lat && stop.reverseLng === stop.lng;
  if (shared) return [{ id:index * 2 + 1, stop, direction:null }];
  const points: StopPoint[] = [];
  if (canOutbound) points.push({ id:index * 2 + 1, stop, direction:"outbound" });
  if (canReverse) points.push({ id:index * 2 + 2, stop, direction:"reverse" });
  return points;
});
const pointFor = (name:string, direction:Direction | null) => stopPoints.find((point) => point.stop.name === name && point.direction === direction) ?? stopPoints.find((point) => point.stop.name === name);

const stopSlug = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const linkedSelection = () => {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("stop_id"));
  const point = Number.isInteger(id) ? stopPoints.find((item) => item.id === id) : undefined;
  if (point) return { name:point.stop.name, direction:point.direction };
  const slug = params.get("stop");
  const direction = params.get("direction");
  return {
    name: stops.find((stop) => stopSlug(stop.name) === slug)?.name,
    direction: direction === "canj" ? "outbound" : direction === "stari-bar" ? "reverse" : null,
  } as { name?: string; direction: Direction | null };
};
const stopUrl = (name: string, direction: Direction | null) => {
  const url = new URL(window.location.href);
  const point = pointFor(name, direction);
  url.searchParams.set("stop", stopSlug(name));
  if (point) url.searchParams.set("stop_id", String(point.id));
  else url.searchParams.delete("stop_id");
  if (point?.direction) url.searchParams.set("direction", point.direction === "outbound" ? "canj" : "stari-bar");
  else url.searchParams.delete("direction");
  return url;
};

function range(start: number, end: number, step: number) {
  const result: number[] = [];
  for (let value = start; value <= end; value += step) result.push(value);
  return result;
}

const terminalTrips = {
  outbound: [...[310, 360, 420], ...range(480, 1320, 30), 1380, 1440].map(
    (time): Trip => ({ time, service: "Čanj" }),
  ),
  reverse: [...[360, 420, 480], ...range(540, 1380, 30), 1440, 1510].map(
    (time): Trip => ({ time, service: "Čanj" }),
  ),
  shortOutbound: range(540, 1260, 15).map((time): Trip => ({ time, service: "Sutomore" })),
  shortReverse: range(570, 1290, 15).map((time): Trip => ({ time, service: "Sutomore" })),
};

function clock(total: number) {
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function waitLabel(minutes: number) {
  if (minutes <= 0) return "sada";
  if (minutes < 60) return `za ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `za ${hours} h${rest ? ` ${rest} min` : ""}`;
}

function getTrips(stop: Stop, direction: Direction) {
  const index = stops.findIndex((item) => item.name === stop.name);
  const sutomoreIndex = stops.findIndex((item) => item.name === "Sutomore");
  const reverseOffset = 55 - stop.offset;
  const longTrips = direction === "outbound" ? terminalTrips.outbound : terminalTrips.reverse;
  let result = longTrips.map((trip) => ({
    ...trip,
    time: trip.time + (direction === "outbound" ? stop.offset : reverseOffset),
  }));

  if (direction === "outbound" && index < sutomoreIndex) {
    result = [...result, ...terminalTrips.shortOutbound.map((trip) => ({ ...trip, time: trip.time + stop.offset }))];
  }
  if (direction === "reverse" && index > 0 && index <= sutomoreIndex) {
    result = [...result, ...terminalTrips.shortReverse.map((trip) => ({ ...trip, time: trip.time + reverseOffset }))];
  }
  return result.sort((a, b) => a.time - b.time);
}

function nextTrips(trips: Trip[], currentMinutes: number) {
  return trips
    .flatMap((trip) => [trip, { ...trip, time: trip.time + 1440 }])
    .filter((trip) => trip.time >= currentMinutes)
    .sort((a, b) => a.time - b.time);
}

function scheduleBlock(stop: Stop, direction: Direction, currentMinutes: number) {
  const stopIndex = stops.findIndex((item) => item.name === stop.name);
  const sutomoreIndex = stops.findIndex((item) => item.name === "Sutomore");
  const destination = direction === "reverse" ? "Stari Bar" : stopIndex < sutomoreIndex ? "Sutomore / Čanj" : "Čanj";
  const trips = getTrips(stop, direction);
  const timeline = trips.flatMap((trip) => [{ ...trip, time:trip.time - 1440 }, trip, { ...trip, time:trip.time + 1440 }]).sort((a,b)=>a.time-b.time);
  const previous = [...timeline].reverse().find((trip) => trip.time < currentMinutes);
  const next = timeline.filter((trip) => trip.time >= currentMinutes).slice(0, 4);
  const row = (trip: Trip & { time:number }, previousRow=false) => `<li class="${previousRow ? "previous" : ""}"><b>${clock(trip.time)}</b><span>${direction === "reverse" ? "Stari Bar" : trip.service}</span></li>`;
  return `<section class="popupRoute ${direction}"><h4><i></i> Krajnja stanica: ${destination}</h4><ul>${previous ? row(previous,true) : ""}${next.map((trip)=>row(trip)).join("")}</ul></section>`;
}

function stopPopup(stop: Stop, directions: Direction[], stopId:number) {
  const date = new Date();
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const stopIndex = stops.findIndex((item)=>item.name===stop.name);
  const sutomoreIndex = stops.findIndex((item)=>item.name==="Sutomore");
  const full = directions.map((direction) => {
    const destination = direction === "reverse" ? "Stari Bar" : stopIndex < sutomoreIndex ? "Sutomore / Čanj" : "Čanj";
    return `<h5>${destination}</h5><div class="popupAllTimes">${getTrips(stop,direction).map((trip)=>`<span>${clock(trip.time)}</span>`).join("")}</div>`;
  }).join("");
  return `<div class="stopPopup"><header><strong>${stop.name} <span class="stopId">#${stopId}</span></strong><small>Najbliži polasci</small></header>${directions.map((direction)=>scheduleBlock(stop,direction,currentMinutes)).join("")}<details><summary>Prikaži sve</summary>${full}</details></div>`;
}

function BusMap({ selected, selectedDirection, onSelect }: { selected: string; selectedDirection: Direction | null; onSelect: (name: string, direction: Direction | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef({ name:selected, direction:selectedDirection });
  const markersRef = useRef<Map<string, import("leaflet").CircleMarker>>(new Map());
  onSelectRef.current = onSelect;
  selectedRef.current = { name:selected, direction:selectedDirection };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true })
        .setView([42.126, 19.066], 12);
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      L.polyline(outboundRoute, { color: "#087aa5", weight: 5, opacity: 0.88 }).addTo(map);
      L.polyline(reverseRoute, { color: "#ef8c45", weight: 4, opacity: 0.82 }).addTo(map);

      const Legend = L.Control.extend({ onAdd:() => { const el=L.DomUtil.create("div","mapLegend"); el.innerHTML='<b><i class="lineBlue"></i> ka Čanju</b><b><i class="lineOrange"></i> ka Starom Baru</b>'; L.DomEvent.disableClickPropagation(el); return el; } });
      new Legend({ position:"topright" }).addTo(map);

      let userMarker: ReturnType<typeof L.circleMarker> | null = null;
      let accuracyCircle: ReturnType<typeof L.circle> | null = null;
      const Locate = L.Control.extend({ onAdd:() => { const wrap=L.DomUtil.create("div","leaflet-bar mapTool"); const button=L.DomUtil.create("button","locateButton",wrap); button.type="button"; button.title="Moja lokacija"; button.setAttribute("aria-label","Prikaži moju lokaciju"); button.textContent="⌖"; L.DomEvent.on(button,"click",(event)=>{ L.DomEvent.stop(event); button.classList.add("loading"); map.locate({ setView:true, maxZoom:16, enableHighAccuracy:true }); }); L.DomEvent.disableClickPropagation(wrap); return wrap; } });
      new Locate({ position:"bottomright" }).addTo(map);
      map.on("locationfound",(event)=>{ document.querySelector(".locateButton")?.classList.remove("loading"); userMarker?.remove(); accuracyCircle?.remove(); userMarker=L.circleMarker(event.latlng,{ radius:8,color:"#fff",weight:3,fillColor:"#4b67e8",fillOpacity:1 }).addTo(map).bindTooltip("Ovdje ste",{ permanent:true,direction:"top" }); accuracyCircle=L.circle(event.latlng,{ radius:event.accuracy,color:"#4b67e8",weight:1,fillColor:"#4b67e8",fillOpacity:.09 }).addTo(map); });
      map.on("locationerror",()=>{ document.querySelector(".locateButton")?.classList.remove("loading"); window.alert("Nije moguće odrediti lokaciju. Dozvolite sajtu pristup geolokaciji."); });

      let measuring=false;
      let measurePoints: ReturnType<typeof L.latLng>[]=[];
      let measureLine: ReturnType<typeof L.polyline> | null=null;
      let measureTip: ReturnType<typeof L.tooltip> | null=null;
      const clearMeasure=()=>{ measurePoints=[]; measureLine?.remove(); measureTip?.remove(); measureLine=null; measureTip=null; };
      const distanceText=()=>{ let metres=0; for(let i=1;i<measurePoints.length;i++) metres+=measurePoints[i-1].distanceTo(measurePoints[i]); return metres>=1000?`${(metres/1000).toFixed(2)} km`:`${Math.round(metres)} m`; };
      const Measure = L.Control.extend({ onAdd:() => { const wrap=L.DomUtil.create("div","leaflet-bar mapTool"); const button=L.DomUtil.create("button","measureButton",wrap); button.type="button"; button.title="Izmjeri udaljenost"; button.setAttribute("aria-label","Izmjeri udaljenost"); button.textContent="↔"; L.DomEvent.on(button,"click",(event)=>{ L.DomEvent.stop(event); measuring=!measuring; button.classList.toggle("active",measuring); map.getContainer().classList.toggle("measuring",measuring); if(measuring) clearMeasure(); }); L.DomEvent.disableClickPropagation(wrap); return wrap; } });
      new Measure({ position:"bottomright" }).addTo(map);
      map.on("click",(event)=>{ if(!measuring) return; measurePoints.push(event.latlng); measureLine?.remove(); measureTip?.remove(); measureLine=L.polyline(measurePoints,{ color:"#7a4ce0",weight:3,dashArray:"7 6" }).addTo(map); if(measurePoints.length>1) measureTip=L.tooltip({ permanent:true,direction:"top",className:"measureTooltip" }).setLatLng(event.latlng).setContent(distanceText()).addTo(map); });
      map.on("dblclick",()=>{ if(measuring){ measuring=false; document.querySelector(".measureButton")?.classList.remove("active"); map.getContainer().classList.remove("measuring"); } });
      const popupMaxHeight = Math.max(210, Math.min(360, window.innerHeight - 240));
      stops.forEach((stop) => {
        const points: { lat:number; lng:number; direction:Direction }[] = [];
        const canOutbound = stop.offset < 55 && stop.outbound !== false;
        const canReverse = stop.offset > 0 && stop.reverse !== false;
        if (canOutbound) points.push({ lat:stop.lat, lng:stop.lng, direction:"outbound" });
        if (canReverse && stop.reverseLat && stop.reverseLng && (!canOutbound || stop.reverseLat !== stop.lat || stop.reverseLng !== stop.lng)) points.push({ lat:stop.reverseLat, lng:stop.reverseLng, direction:"reverse" });
        points.forEach((point) => {
          const marker = L.circleMarker([point.lat, point.lng], {
            radius: 7,
            color: "#ffffff", weight: 3, fillColor: point.direction === "outbound" ? "#087aa5" : "#ef8c45", fillOpacity: 1,
          }).addTo(map);
          const destination = point.direction === "outbound" ? "Čanj" : "Stari Bar";
          const sharedPoint = canOutbound && canReverse && stop.reverseLat === stop.lat && stop.reverseLng === stop.lng;
          marker.bindTooltip(`${stop.name} · ${sharedPoint ? "oba smjera" : `ka ${destination}`}`, { direction: "top", offset: [0, -7] });
          const directions: Direction[] = sharedPoint ? ["outbound","reverse"] : [point.direction];
          marker.bindPopup("", {
            maxWidth:320,
            minWidth:Math.min(260, window.innerWidth - 52),
            maxHeight:popupMaxHeight,
            autoPan:true,
            keepInView:false,
            autoPanPaddingTopLeft:L.point(20, 90),
            autoPanPaddingBottomRight:L.point(20, 24),
          });
          const markerDirection = sharedPoint ? null : point.direction;
          const stopId = pointFor(stop.name, markerDirection)?.id ?? 0;
          marker.on("popupopen", () => marker.setPopupContent(stopPopup(stop,directions,stopId)));
          marker.on("click", () => onSelectRef.current(stop.name, markerDirection));
          markersRef.current.set(`${stop.name}:${markerDirection ?? "both"}`, marker);
        });
      });
      const initialKey = `${selectedRef.current.name}:${selectedRef.current.direction ?? "both"}`;
      const initialMarker = markersRef.current.get(initialKey)
        ?? markersRef.current.get(`${selectedRef.current.name}:outbound`)
        ?? markersRef.current.get(`${selectedRef.current.name}:reverse`);
      if (initialMarker) {
        const zoom = 15;
        const center = map.unproject(map.project(initialMarker.getLatLng(), zoom).subtract([0, 50]), zoom);
        map.setView(center, zoom, { animate:false });
        initialMarker.openPopup();
      }
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markersRef.current.clear(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const marker = markersRef.current.get(`${selected}:${selectedDirection ?? "both"}`)
      ?? markersRef.current.get(`${selected}:outbound`)
      ?? markersRef.current.get(`${selected}:reverse`);
    if (marker) {
      const zoom = Math.max(map.getZoom(), 15);
      const center = map.unproject(map.project(marker.getLatLng(), zoom).subtract([0, 50]), zoom);
      map.setView(center, zoom, { animate:false });
      window.requestAnimationFrame(() => marker.openPopup());
    }
  }, [selected, selectedDirection]);

  return <div className="map" ref={containerRef} aria-label="Mapa autobuskih stajališta u Baru" />;
}

export default function Home() {
  const [stopName, setStopName] = useState("Željeznička stanica");
  const [stopDirection, setStopDirection] = useState<Direction | null>(null);
  const [currentMinutes, setCurrentMinutes] = useState(0);
  const [expanded, setExpanded] = useState<Direction | null>(null);
  const [copied, setCopied] = useState(false);
  const stop = stops.find((item) => item.name === stopName) ?? stops[0];
  const selectedPoint = pointFor(stop.name, stopDirection);
  const alternatePoint = stopPoints.find((point) => point.stop.name === stop.name && point.id !== selectedPoint?.id);
  const stopIndex = stops.findIndex((item) => item.name === stop.name);
  useEffect(() => {
    const applyLinkedStop = () => {
      const selection = linkedSelection();
      if (selection.name) {
        setStopName(selection.name);
        setStopDirection(selection.direction);
      }
    };
    applyLinkedStop();
    window.addEventListener("popstate", applyLinkedStop);
    return () => window.removeEventListener("popstate", applyLinkedStop);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    };
    updateTime();
    const timer = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectStop = (name: string, direction: Direction | null = null) => {
    setStopName(name);
    setStopDirection(direction);
    setExpanded(null);
    setCopied(false);
    window.history.replaceState({}, "", stopUrl(name, direction));
  };

  const copyStopLink = async () => {
    const url = stopUrl(stop.name, stopDirection);
    window.history.replaceState({}, "", url);
    try { await navigator.clipboard.writeText(url.toString()); }
    catch {
      const field = document.createElement("textarea");
      field.value = url.toString(); document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const options = useMemo(() => {
    const result: { direction: Direction; destination: string; label: string; trips: Trip[] }[] = [];
    const sutomoreIndex = stops.findIndex((item) => item.name === "Sutomore");
    if (stopIndex < stops.length - 1 && stop.outbound !== false) result.push({ direction: "outbound", destination: stopIndex < sutomoreIndex ? "Sutomore / Čanj" : "Čanj", label: "ka sjeveru", trips: getTrips(stop, "outbound") });
    if (stopIndex > 0 && stop.reverse !== false) result.push({ direction: "reverse", destination: "Stari Bar", label: "ka jugu", trips: getTrips(stop, "reverse") });
    return result;
  }, [stop, stopIndex]);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark">B</span><span>Autobusi Bar</span></div>
        <div className="live"><span /> Po lokalnom vremenu · {clock(currentMinutes)}</div>
      </header>

      <section className="mapHero">
        <div className="mapIntro">
          <div className="eyebrow">Autobusi Bar · Crna Gora</div>
          <h1>Izaberite stajalište</h1>
          <p>Dodirnite tačku na mapi da vidite kuda i kada možete putovati.</p>
        </div>
        <div className="mapShell">
          <BusMap selected={stop.name} selectedDirection={stopDirection} onSelect={selectStop} />
          <div className="mapHint"><span>●</span> Izaberite stajalište</div>
        </div>
      </section>

      <section className="departures">
        <div className="selectedHeading">
          <div><span className="kicker">Izabrano stajalište</span><h2><span>{stop.name} {selectedPoint && <span className="stopId">#{selectedPoint.id}</span>}</span>{selectedPoint && <span className="currentDirection">{selectedPoint.direction === "outbound" ? "→ Čanj" : selectedPoint.direction === "reverse" ? "→ Stari Bar" : "↔ Čanj / Stari Bar"}</span>}</h2></div>
          <div className="stopActions">
            <label><span>Ili izaberite sa liste</span><select value={stop.name} onChange={(event) => { const point=pointFor(event.target.value,null); if(point) selectStop(point.stop.name,point.direction); }}>{alphabeticStops.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
            {alternatePoint && <button className="changeDirection" type="button" onClick={() => selectStop(alternatePoint.stop.name,alternatePoint.direction)}><span>Promijeni smjer</span>{alternatePoint.direction === "outbound" ? "→ Čanj" : "→ Stari Bar"}</button>}
            <button className="shareStop" type="button" onClick={copyStopLink} aria-live="polite">{copied ? "Kopirano ✓" : "Kopiraj link"}</button>
          </div>
        </div>

        <div className={`directionGrid count${options.length}`}>
          {options.map((option) => {
            const upcoming = nextTrips(option.trips, currentMinutes);
            const next = upcoming[0];
            return (
              <article className="directionCard" key={option.direction}>
                <div className="directionTop"><div><span className="directionLabel">{option.label}</span><h3>→ {option.destination}</h3></div><span className="routeBadge">Mediteran Express</span></div>
                <div className="nextDeparture">
                  <div><small>Sljedeći polazak</small><strong>{clock(next.time)}</strong></div>
                  <span>{waitLabel(next.time - currentMinutes)}</span>
                </div>
                <div className="miniTimes">
                  {upcoming.slice(1, 4).map((trip, index) => <div key={`${trip.time}-${trip.service}-${index}`}><strong>{clock(trip.time)}</strong><span>{option.direction === "reverse" ? "do Starog Bara" : trip.service === "Sutomore" ? "do Sutomora" : "do Čanja"}</span></div>)}
                </div>
                <button onClick={() => setExpanded(expanded === option.direction ? null : option.direction)}>{expanded === option.direction ? "Sakrij red vožnje" : "Svi polasci"}<span>⌄</span></button>
                {expanded === option.direction && <div className="fullTimes">{option.trips.map((trip, index) => <span key={`${trip.time}-${trip.service}-${index}`}>{clock(trip.time)}</span>)}</div>}
              </article>
            );
          })}
        </div>
        {stop.offset !== 0 && stop.offset !== 55 && <p className="estimateNote">Koordinate i redosljed stajališta preuzeti su sa WikiRoutes. Vrijeme dolaska na usputna stajališta je procijenjeno.</p>}
      </section>

      <section className="routeStrip">
        <div><span className="kicker">Linija</span><h2>Stari Bar — Sutomore — Čanj</h2></div>
        <div className="stripStops">{stops.map((item) => <button className={item.name === stop.name ? "active" : ""} onClick={() => selectStop(item.name)} key={item.name}><i />{item.name}</button>)}</div>
      </section>

      <section className="stopDirectory">
        <div><span className="kicker">Stop ID</span><h2>Sva stajališta</h2><p>Broj označava tačnu tačku i smjer na mapi.</p></div>
        <div className="stopList">
          {stopPoints.map((point) => <button key={point.id} type="button" onClick={() => selectStop(point.stop.name, point.direction)}><span className="stopId">#{point.id}</span><strong>{point.stop.name}</strong><small>{point.direction === "outbound" ? "ka Čanju" : point.direction === "reverse" ? "ka Starom Baru" : "oba smjera"}</small></button>)}
        </div>
      </section>

      <footer><strong>Autobusi Bar</strong><span>Nezvanični red vožnje · ažurirano 5. avgusta 2026.</span><a href="https://wikiroutes.info/en/bar?routes=53424" target="_blank" rel="noreferrer">Izvor trase ↗</a></footer>
    </main>
  );
}
