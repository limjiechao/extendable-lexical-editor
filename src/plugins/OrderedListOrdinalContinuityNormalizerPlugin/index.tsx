/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type {LexicalEditor, RootNode} from 'lexical';

import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$getRoot, $isRootNode} from 'lexical';
import {useEffect} from 'react';

type Spine = {
  listItems: ListItemNode[];
  lists: ListNode[];
};

type Edge = 'leading' | 'trailing';

type ChildGetter = Extract<keyof ListNode, 'getFirstChild' | 'getLastChild'>;

const EDGE_TO_CHILD_GETTER = {
  leading: 'getFirstChild',
  trailing: 'getLastChild',
} as const satisfies Record<Edge, ChildGetter>;

const EDGE_TO_CHILD_INDEX = {
  leading: 0,
  trailing: -1,
} satisfies Record<Edge, 0 | -1>;

function traverseEdge(rootList: ListNode, edge: Edge): Spine {
  const listItems: ListItemNode[] = [];
  const lists: ListNode[] = [];

  let currentList: ListNode | null = rootList;

  while (currentList) {
    lists.push(currentList);

    const edgeChildGetter = EDGE_TO_CHILD_GETTER[edge];

    const edgeListItem: ListItemNode | null = currentList[edgeChildGetter]();

    if (!edgeListItem || !$isListItemNode(edgeListItem)) {
      break;
    }

    listItems.push(edgeListItem);

    const listNodeChildren: ListNode[] = edgeListItem
      .getChildren()
      .filter($isListNode);
    const childListIndex = EDGE_TO_CHILD_INDEX[edge];
    const nestedList = listNodeChildren.at(childListIndex) ?? null;

    currentList = nestedList;
  }

  return {listItems, lists};
}

type RootListSpines = {
  rootList: ListNode;
  leading: Spine;
  trailing: Spine;
};

type SpineTraversalResult = RootListSpines[];

const traverseAllListEdges = (lexicalRoot: RootNode): SpineTraversalResult => {
  const result: SpineTraversalResult = [];

  const children = lexicalRoot.getChildren();

  children.forEach((node) => {
    if (!$isListNode(node)) {
      return;
    }

    const leading = traverseEdge(node, 'leading');
    const trailing = traverseEdge(node, 'trailing');

    result.push({
      leading,
      rootList: node,
      trailing,
    });
  });

  return result;
};

type OrdinalContinuityPlan = {
  /**
   * NOTE: Depths at which continuity was actually applied
   *
   * This makes continuity semantic, rather than structural.
   *
   * ```ts
   * const sameListIsLeadingAndTrailing =
   *   leadingListNodeKeyAtCurrentDepth === trailingListNodeKeyAtCurrentDepth;
   *  ```
   *
   * This assumes if the previous plan’s leading and trailing list at this
   * depth are the same node, then this depth represents a continuous chain.
   *
   * This is fragile as depending on leading and trailing lists being the same
   * node is an implementation artifact of spine extraction.
   *
   * What we actually care about: Did the previous plan apply continuity at
   * this depth?
   *
   * That works today, but it encodes a structural coincidence, not a semantic rule.
   */
  appliedDepths: Set<number>;
  linkDepth: number;
  linkedDepths: number[];
  startsByDepth: Map<number, number>;
  leadingLists: ListNode[];
  trailingLists: ListNode[];
};

const isNumberedList = (list: ListNode) => list.getListType() === 'number';

const pairSoftAdjacentListEdges = (listEdges: SpineTraversalResult) =>
  listEdges.reduce<[RootListSpines, RootListSpines][]>(
    (pairs, current, index, array) => {
      const next = array[index + 1];

      if (next) {
        pairs.push([current, next] as const);
      }

      return pairs;
    },
    [],
  );

const computeExpectedStartsByDepthForLink = (
  previousSpine: RootListSpines,
  nextSpine: RootListSpines,
): Map<number, number> => {
  const commonMaximumDepth =
    Math.min(
      previousSpine.trailing.lists.length,
      nextSpine.leading.lists.length,
    ) - 1;

  const maximumDepthInPreviousSpine = previousSpine.trailing.lists.length - 1;

  const findDeepestLinkableDepth = (depth: number): number =>
    depth < 0
      ? -1
      : (() => {
          const previousList = previousSpine.trailing.lists[depth];
          const nextList = nextSpine.leading.lists[depth];

          const bothListsAreNumbered =
            isNumberedList(previousList) && isNumberedList(nextList);

          return bothListsAreNumbered
            ? depth
            : findDeepestLinkableDepth(depth - 1);
        })();

  const deepestLinkDepth = findDeepestLinkableDepth(commonMaximumDepth);

  const linkedDepths =
    deepestLinkDepth < 0
      ? []
      : Array.from({length: deepestLinkDepth + 1}, (_, index) => index);

  return new Map<number, number>(
    linkedDepths
      .map((currentDepth) => {
        const previousLastValue =
          previousSpine.trailing.listItems[currentDepth]?.getValue();

        const previousLastValueIsValid =
          Number.isFinite(previousLastValue) && previousLastValue > 0;

        const isLinkedAtMaxmimumDepth =
          maximumDepthInPreviousSpine === deepestLinkDepth;
        const currentDepthIsDeepestLinkedDepth =
          currentDepth === deepestLinkDepth;
        const requiresIncrementAtThisDepth =
          isLinkedAtMaxmimumDepth && currentDepthIsDeepestLinkedDepth;

        const expectedStart = previousLastValueIsValid
          ? requiresIncrementAtThisDepth
            ? previousLastValue + 1
            : previousLastValue
          : 0;

        return [currentDepth, expectedStart] as const;
      })
      .filter(([, expectedStart]) => expectedStart > 0),
  );
};

const LIST_BOUNDARY_STATE = {
  BROKEN: 'broken', // Explicit restart (future use)
  COLD: 'cold', // No continuity intent
  HOT: 'hot', // Continuity established and preserved
} as const;

type ListBoundaryEvaluation =
  | {state: typeof LIST_BOUNDARY_STATE.COLD}
  | {
      state: typeof LIST_BOUNDARY_STATE.HOT;
      expectedStartsByDepth: Map<number, number>;
    };

const evaluateListBoundary = (
  previousSpine: RootListSpines,
  nextSpine: RootListSpines,
): ListBoundaryEvaluation => {
  const expectedStartsByDepth = computeExpectedStartsByDepthForLink(
    previousSpine,
    nextSpine,
  );

  if (expectedStartsByDepth.size === 0) {
    return {state: LIST_BOUNDARY_STATE.COLD};
  }

  const isHot = Array.from(expectedStartsByDepth.entries()).some(([depth]) => {
    const nextListAtDepth = nextSpine.leading.lists[depth];
    if (!nextListAtDepth) {
      return false;
    }

    const currentStart = nextListAtDepth.getStart();

    if (!Number.isFinite(currentStart) || currentStart === 1) {
      return false;
    }

    // Bootstrap or preservation
    return true;
  });

  return isHot
    ? {expectedStartsByDepth, state: LIST_BOUNDARY_STATE.HOT}
    : {state: LIST_BOUNDARY_STATE.COLD};
};

const deriveChainedOrdinalContinuityPlanFromExpectedStarts = (
  nextSpine: RootListSpines,
  expectedStartsByDepth: Map<number, number>,
): OrdinalContinuityPlan => {
  const linkedDepths = Array.from(expectedStartsByDepth.keys()).sort(
    (a, b) => a - b,
  );

  const linkDepth = linkedDepths.reduce((max, d) => (d > max ? d : max), -1);

  const startsByDepth = new Map<number, number>(expectedStartsByDepth);

  const appliedDepths = new Set<number>(startsByDepth.keys());

  return {
    appliedDepths,
    leadingLists: nextSpine.leading.lists,
    linkDepth,
    linkedDepths,
    startsByDepth,
    trailingLists: nextSpine.trailing.lists,
  };
};

const deriveCascadedOrdinalContinuityPlans = (
  chainedOrdinalContinuityPlans: Array<OrdinalContinuityPlan | null>,
) => {
  return chainedOrdinalContinuityPlans.reduce<
    Array<OrdinalContinuityPlan | null>
  >((plans, plan) => {
    const previousPlan = plans.at(-1) ?? null;

    // Break in continuity chain: reset cascade.
    if (!plan || !previousPlan) {
      plans.push(plan);
      return plans;
    }

    plan.startsByDepth.forEach((start, depth) => {
      const lastStart = previousPlan.startsByDepth.get(depth) ?? NaN;

      if (Number.isNaN(lastStart)) {
        return;
      }

      const shouldCascadeContinuity =
        previousPlan.appliedDepths.has(depth) && lastStart > start;

      plan.startsByDepth.set(
        depth,
        shouldCascadeContinuity ? lastStart : start,
      );
    });

    plans.push(plan);
    return plans;
  }, []);
};

type Normalization = () => void;

const computeOrderedListOrdinalContinuityNormalizations = (
  rootNode: RootNode,
): Normalization[] => {
  const allListEdges = traverseAllListEdges(rootNode);

  const adjacentListEdges = pairSoftAdjacentListEdges(allListEdges);

  const chainedOrdinalContinuityPlans = adjacentListEdges.map(
    ([previous, next]) => {
      const evaluation = evaluateListBoundary(previous, next);

      return evaluation.state === LIST_BOUNDARY_STATE.HOT
        ? deriveChainedOrdinalContinuityPlanFromExpectedStarts(
            next,
            evaluation.expectedStartsByDepth,
          )
        : null;
    },
  );

  const cascadedOrdinalContinuityPlans = deriveCascadedOrdinalContinuityPlans(
    chainedOrdinalContinuityPlans,
  );

  // Apply (idempotently): only write when mismatched.
  const normalizations = cascadedOrdinalContinuityPlans.reduce<Normalization[]>(
    (allPlanNormalizations, plan) => {
      if (!plan) {
        return allPlanNormalizations;
      }

      const singlePlanNormalizations = plan.linkedDepths.reduce<
        Normalization[]
      >((listStartSetters, depth) => {
        const list = plan.leadingLists[depth];
        const start = plan.startsByDepth.get(depth) ?? 0;

        // Only normalize ordered lists. (Skip bullets/checks.)
        if (!isNumberedList(list) || start <= 0) {
          return listStartSetters;
        }

        const currentStart = list.getStart();

        if (currentStart === start) {
          return listStartSetters;
        }

        listStartSetters.push(() => {
          list.setStart(start);
        });

        return listStartSetters;
      }, []);

      return allPlanNormalizations.concat(singlePlanNormalizations);
    },
    [],
  );

  return normalizations;
};

/* REF: https://lexical.dev/docs/concepts/listeners#registerupdatelistener
 * REF: https://lexical.dev/docs/concepts/transforms
 *
 * Use note transform to avoid update waterfalls or infinite update loops
 */
function registerOrderedListOrdinalContinuityNormalizer(
  editor: LexicalEditor,
): () => void {
  return editor.registerNodeTransform(ListNode, (maybeDirtyList) => {
    if (!isNumberedList(maybeDirtyList)) {
      return;
    }

    const parents = maybeDirtyList.getParents();
    const root = parents.at(-1) ?? null;
    const rootChild = parents.at(-2) ?? null;
    const isRootLevelListNode = parents.length === 1;
    const isNestedWithinRootLevelListNode =
      parents.length >= 2 && $isRootNode(root) && $isListNode(rootChild);

    if (!(isNestedWithinRootLevelListNode || isRootLevelListNode)) {
      return;
    }

    const isPureOrderedListChain = parents
      .filter((parent) => $isListNode(parent))
      .every((listNode) => isNumberedList(listNode));

    if (!isPureOrderedListChain) {
      return;
    }

    const rootNode = $getRoot();
    const normalizations =
      computeOrderedListOrdinalContinuityNormalizations(rootNode);

    normalizations.forEach((normalization) => normalization());
  });
}

/**
 * # Linked Ordered Lists Normalizer
 *
 * This plugin normalizes numbering continuity across adjacent root-level
 * ordered lists in a Lexical document.
 *
 * It is designed to be idempotent and to run inside a ListNode NodeTransform
 * so all mutations occur within the same editor update pass.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Structural Scope & Assumptions
 *
 * - Only ListNode instances that are direct children of the editor RootNode
 *   participate as continuity boundaries. Document order is defined strictly
 *   by `RootNode.getChildren()`.
 *
 * - Continuity boundaries are evaluated between “adjacent” root-level list nodes
 *   under a *soft adjacency* policy:
 *   - We first filter `RootNode.getChildren()` to only `ListNode`s.
 *   - Adjacency is then defined within that filtered sequence.
 *
 *   Result: non-list root nodes (paragraphs/quotes/tables/etc.) are ignored for
 *   pairing, so two lists separated by such nodes are still treated as adjacent
 *   continuity candidates.
 *
 * - Nested lists are included only as part of a root list’s “spine” (see below),
 *   not as independent continuity blocks.
 *
 * - This plugin assumes Lexical list structure invariants:
 *   a ListNode contains ListItemNode children, and nested ListNodes (if any)
 *   exist as direct children of a ListItemNode.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # List Semantics
 *
 * - Only numbered (ordered) lists participate in continuity. Bullet/check lists
 *   are excluded. The NodeTransform only executes for numbered ListNodes, and
 *   continuity computations only link depths where *both* sides are numbered.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Spine Model (Edge Traversal)
 *
 * - Each root-level list is modeled as two “spines”:
 *   - Leading spine: first list item → (first nested list) → …
 *   - Trailing spine: last  list item → (last  nested list) → …
 *
 * - At each depth, traversal selects the edge list item (`getFirstChild` or
 *   `getLastChild`). From that list item, it discovers nested ListNode children
 *   and selects either the first or last nested list depending on traversal edge.
 *
 * - If a list item contains multiple nested lists at the same depth, selection
 *   is edge-dependent (first for leading, last for trailing). This is a
 *   structural heuristic that makes “continuity depth” determinate.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Boundary Intent Model (Opt-in / Preserved)
 *
 * Continuity is *not* assumed by default. A boundary between two adjacent root
 * lists is considered linkable only if it is “HOT”.
 *
 * The boundary is evaluated via `evaluateListBoundary(previous, next)`:
 *
 * - First, compute `expectedStartsByDepth` (see below). If it is empty, the
 *   boundary is COLD.
 *
 * - Otherwise, the boundary is HOT if, at any depth in `expectedStartsByDepth`,
 *   the next list at that depth has a non-default `start` value.
 *
 *   Specifically:
 *   - `start` is considered *default* if it is non-finite or `=== 1`.
 *   - Any finite `start !== 1` is treated as “bootstrap or preservation”.
 *
 * This matches the production policy:
 * - Authorial intent: a user can explicitly set list `start` (e.g. “Continue
 *   numbering”, “Set numbering value…”, or typing an explicit ordinal).
 * - Structural intent: once a boundary has been activated (non-default `start`),
 *   it remains eligible for re-normalization even if the upstream list changes
 *   later (preservation).
 *
 * Note: This model does not yet implement an explicit BROKEN boundary state.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Expected Start Computation (Link Semantics)
 *
 * `computeExpectedStartsByDepthForLink(previous, next)` computes a map:
 *   depth -> expectedStart
 *
 * - Depth range considered is bounded by the shallowest common depth of:
 *   `previous.trailing.lists` and `next.leading.lists`.
 *
 * - The deepest linkable depth is the deepest depth where both lists at that
 *   depth are numbered (ordered). All shallower depths down to 0 are considered
 *   linked depths for this boundary.
 *
 * - For each linked depth:
 *   - Read the previous trailing spine’s list item value at that depth:
 *     `previous.trailing.listItems[depth].getValue()`.
 *   - Missing/zero/non-finite values are treated defensively as non-linkable at
 *     that depth (filtered out of the map).
 *
 * - Increment rule (Lexical-specific):
 *   Only the deepest linked depth may require `+1`, and only when the previous
 *   spine’s maximum depth equals that deepest linked depth.
 *
 *   In other words:
 *   - If the deepest linked depth is also the deepest depth of the previous
 *     trailing spine, expectedStart = previousLastValue + 1
 *   - Otherwise, expectedStart = previousLastValue
 *
 *   This relies on Lexical semantics where the trailing ListItem value at the
 *   deepest depth represents the last rendered ordinal, while parent depths
 *   already represent the next start value.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Plan Construction & Applied Depths
 *
 * - When a boundary is HOT, its continuity plan is derived directly from the
 *   `expectedStartsByDepth` map (single source of truth):
 *
 *   - `linkedDepths` = sorted keys of `expectedStartsByDepth`
 *   - `startsByDepth` = copy of `expectedStartsByDepth`
 *   - `appliedDepths` = keys of `startsByDepth` (semantic: “continuity applies
 *     at exactly these depths”, not an artifact of spine structure)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Cascading Behavior Across Multiple Boundaries
 *
 * - Plans are computed for every adjacent root-level list pair, producing a
 *   sequence that may include `null` entries for COLD boundaries.
 *
 * - Cascading respects breaks: a `null` plan resets the cascade chain.
 *
 * - For consecutive non-null plans, starts may be cascaded forward per depth:
 *   - If the previous plan applied continuity at the depth and its start is
 *     greater than the current plan’s start, the current plan inherits the
 *     previous plan’s start at that depth.
 *   - Starts are monotonic per depth and never decrease.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Normalization Semantics (Mutations)
 *
 * - For each plan, for each `linkedDepth`:
 *   - Only normalize numbered lists and only when `start > 0`.
 *   - Write `list.setStart(start)` only when `list.getStart() !== start`.
 *
 * - The algorithm is idempotent (no-op when already normalized).
 *
 * - This implementation recomputes the entire root-level boundary sequence on
 *   each eligible ListNode transform; it favors correctness over partial
 *   recomputation.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Explicit Non-Goals (Current)
 *
 * - No continuity across non-list root nodes (they break pairing)
 * - No support for mixed list types in a linked boundary
 * - No repair of malformed list structures
 * - No explicit “BROKEN” boundary (restart intent) handling yet
 *
 */
function OrderedListOrdinalContinuityNormalizerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = registerOrderedListOrdinalContinuityNormalizer(editor);

    return unregister;
  }, [editor]);

  return null;
}

export default OrderedListOrdinalContinuityNormalizerPlugin;
