function groupMemberPairs(members, filter = "") {
  const byId = new Map(members.map((member) => [member.id, member]));
  const seen = new Set();
  const query = filter.trim().toLowerCase();
  const groups = [];
  for (const member of members) {
    if (seen.has(member.id)) continue;
    const partner = byId.get(member.partnerId);
    const group = partner && partner.id !== member.id && partner.partnerId === member.id
      ? [member, partner] : [member];
    group.forEach((item) => seen.add(item.id));
    if (!query || group.some((item) => item.nick.toLowerCase().includes(query))) groups.push(group);
  }
  return groups;
}

function memberCardMarkup(member) {
  return `
    <article class="member-card ${member.goldEffect ? "gold-active" : ""}" data-member-id="${escapeHtml(member.id)}" style="--mist-color: ${memberFogColor(member)}">
      ${perimeterMist(member)}
      <div class="member-avatar">${licenseBadge(member)}</div>
      <div class="member-main">
        <b>${escapeHtml(member.nick)}</b>
        <span>${escapeHtml(member.title || member.rank || "Miembro")}</span>
      </div>
      <span class="member-level">Nv ${escapeHtml(member.level)}</span>
    </article>`;
}

function renderMemberGroups(groups) {
  return groups.map((group) => {
    if (group.length !== 2) return memberCardMarkup(group[0]);
    const color = /^#[0-9a-f]{6}$/i.test(group[0].pairColor || "") ? group[0].pairColor : "#ef8fb5";
    const label = `Pareja: ${group[0].nick} y ${group[1].nick}`;
    return `<div class="member-pair" role="group" aria-label="${escapeHtml(label)}" style="--pair-color: ${color}">
      ${group.map(memberCardMarkup).join("")}
      <span class="pair-bridge" aria-hidden="true"><span class="pair-heart">&#9829;</span></span>
    </div>`;
  }).join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { groupMemberPairs, renderMemberGroups };
}
