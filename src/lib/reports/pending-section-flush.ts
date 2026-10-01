/**
 * Chat Enter (and submit) must persist in-flight editor edits before the
 * assistant reads the DB. Syncing every mounted TipTap field with
 * `getJSON()` is expensive on types that keep all sections mounted (ELR).
 * Skip that work when nothing is dirty.
 */

export type LiveEditorFlushEntry = {
  section: string;
  sync: () => void;
  isDirty: () => boolean;
};

export type SectionFlushEntry = {
  section: string;
  flush: () => Promise<void>;
  needsFlush: () => boolean;
};

export type PendingSectionFlushPlan =
  | { skip: true }
  | {
      skip: false;
      editorsToSync: Array<() => void>;
      sectionsToFlush: Array<() => Promise<void>>;
    };

export function planPendingSectionFlush(opts: {
  liveEditors: Iterable<LiveEditorFlushEntry>;
  sections: Iterable<SectionFlushEntry>;
}): PendingSectionFlushPlan {
  const editorsToSync: Array<() => void> = [];
  const dirtyEditorSections = new Set<string>();
  for (const editor of opts.liveEditors) {
    if (!editor.isDirty()) continue;
    editorsToSync.push(editor.sync);
    dirtyEditorSections.add(editor.section);
  }

  const sectionsToFlush: Array<() => Promise<void>> = [];
  for (const section of opts.sections) {
    if (dirtyEditorSections.has(section.section) || section.needsFlush()) {
      sectionsToFlush.push(section.flush);
    }
  }

  if (editorsToSync.length === 0 && sectionsToFlush.length === 0) {
    return { skip: true };
  }
  return { skip: false, editorsToSync, sectionsToFlush };
}
