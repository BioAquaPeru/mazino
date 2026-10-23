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
        <b><button class="member-name" type="button" data-prize-open="${escapeHtml(member.id)}">${escapeHtml(member.nick)}</button></b>
        <span>${escapeHtml(member.title || member.rank || "Miembro")}</span>
        ${typeof publicDonationMarkup === 'function' ? publicDonationMarkup(member.id) : ''}
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
      <span class="pair-bridge" aria-hidden="true"><svg class="pair-heart" viewBox="0 0 24 24" focusable="false"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/></svg></span>
    </div>`;
  }).join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { groupMemberPairs, renderMemberGroups };
}
