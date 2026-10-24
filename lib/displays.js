const PET_IDS = ['gemi', 'codex', 'claude', 'sparky'];

function overlayBounds(display) {
  const area = display.workArea;
  const height = Math.max(1, Math.min(780, area.height));
  return { x: area.x, y: area.y + area.height - height, width: Math.max(1, area.width), height };
}

function describeDisplays(displays, primaryId) {
  return [...displays].sort((a, b) => {
    if (String(a.id) === String(primaryId)) return -1;
    if (String(b.id) === String(primaryId)) return 1;
    return a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y;
  }).map((display, index) => ({
    id: String(display.id),
    label: display.label || `Tela ${index + 1}`,
    primary: String(display.id) === String(primaryId),
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor || 1,
    rotation: display.rotation || 0,
    resolution: {
      width: Math.round(display.bounds.width * (display.scaleFactor || 1)),
      height: Math.round(display.bounds.height * (display.scaleFactor || 1)),
    },
    windowBounds: overlayBounds(display),
  }));
}

function petAssignments(displays, count, preferences = {}) {
  if (!displays.length) return {};
  const ids = new Set(displays.map((display) => String(display.id)));
  return Object.fromEntries(PET_IDS.slice(0, Math.max(1, Math.min(4, Math.floor(count) || 2))).map((petId, index) => {
    const preferred = preferences[petId];
    // A disconnected preferred display falls back to the primary and returns when reconnected.
    const displayId = preferred !== undefined
      ? ids.has(String(preferred)) ? String(preferred) : String(displays[0].id)
      : String(displays[index % displays.length].id);
    return [petId, displayId];
  }));
}

function viewportFor(display, displays, count, preferences = {}) {
  const assignments = petAssignments(displays, count, preferences);
  return {
    ...display,
    displayId: display.id,
    totalPetCount: count,
    visiblePetIds: PET_IDS.filter((id) => assignments[id] === display.id),
    displays,
  };
}

module.exports = { overlayBounds, describeDisplays, petAssignments, viewportFor };
