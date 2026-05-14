"use client";

import Link from "next/link";
import { InviteButton } from "./invite-button";
import { LeaveGroupButton } from "./leave-group-button";
import { OverflowMenu, type OverflowMenuItem } from "@/components/overflow-menu";

/**
 * The member/admin action row on the group detail page.
 *
 * Previously: four-to-five same-weight buttons wrapped in a flex row
 * with no hierarchy and Leave Group one mis-tap away from Create
 * Sheet. Now: one primary CTA + a kebab overflow with the rest.
 *
 * Primary CTA per role:
 *   - ladder-league admin → `+ Create Sheet`
 *   - free-play admin     → `Group Settings`
 *   - non-admin member    → `Invite Player`
 *
 * Overflow items: the remaining actions, with `Leave Group` rendered
 * in red as the last item. Non-member states (Join Group, login
 * redirect) are handled by the parent server component and don't
 * appear in this row.
 */
export function GroupActionsRow({
  groupId,
  slug,
  groupName,
  groupVisibility,
  isGroupAdmin,
  isLadderLeague,
  contactAdminsHref,
}: {
  groupId: string;
  slug: string;
  groupName: string;
  groupVisibility: string;
  isGroupAdmin: boolean;
  isLadderLeague: boolean;
  contactAdminsHref: string | null;
}) {
  // Build the overflow items in role-dependent order. The renders
  // that need their own modal/dialog (Invite, Leave) use the `render`
  // shape so they can close the menu before opening their UI.
  const items: OverflowMenuItem[] = [];

  // Admins get Invite Player + Group Settings as overflow items
  // (when one of them isn't already the primary CTA).
  if (isGroupAdmin) {
    // Invite is always overflow for admins (Create Sheet / Settings
    // owns the primary slot).
    items.push({
      render: (close) => (
        <InviteButton
          groupId={groupId}
          groupSlug={slug}
          groupName={groupName}
          groupVisibility={groupVisibility}
          renderTrigger={(openModal) => (
            <button
              role="menuitem"
              onClick={() => {
                close();
                openModal();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-dark-100 hover:bg-surface-overlay"
            >
              Invite Player
            </button>
          )}
        />
      ),
    });

    if (isLadderLeague) {
      // Ladder admin's primary is Create Sheet, so Group Settings
      // moves into the overflow.
      items.push({
        render: () => (
          <Link
            href={`/admin/groups/${groupId}?tab=preferences`}
            className="block px-3 py-2 text-sm text-dark-100 hover:bg-surface-overlay"
            role="menuitem"
          >
            Group Settings
          </Link>
        ),
      });
    }
  }

  // Contact Admins for anyone who's a member (admin or otherwise).
  if (contactAdminsHref) {
    items.push({
      render: () => (
        <a
          href={contactAdminsHref}
          className="block px-3 py-2 text-sm text-dark-100 hover:bg-surface-overlay"
          role="menuitem"
        >
          Contact Admins
        </a>
      ),
    });
  }

  // Leave Group is always the last (and red) item. Members and admins
  // alike see it — admins can demote themselves the same way today.
  items.push({
    render: (close) => (
      <LeaveGroupButton
        groupId={groupId}
        groupName={groupName}
        renderTrigger={(leave, leaving) => (
          <button
            role="menuitem"
            disabled={leaving}
            onClick={() => {
              close();
              leave();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {leaving ? "Leaving…" : "Leave Group"}
          </button>
        )}
      />
    ),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary CTA */}
      {isGroupAdmin && isLadderLeague ? (
        <Link
          href={`/admin/sheets/new?groupId=${groupId}`}
          className="btn-primary"
        >
          + Create Sheet
        </Link>
      ) : isGroupAdmin ? (
        <Link
          href={`/admin/groups/${groupId}?tab=preferences`}
          className="btn-primary"
        >
          Group Settings
        </Link>
      ) : (
        <InviteButton
          groupId={groupId}
          groupSlug={slug}
          groupName={groupName}
          groupVisibility={groupVisibility}
          renderTrigger={(open) => (
            <button onClick={open} className="btn-primary">
              Invite Player
            </button>
          )}
        />
      )}

      <OverflowMenu items={items} ariaLabel="Group actions" />
    </div>
  );
}
