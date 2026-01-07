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

const pairAdjacentListEdges = (listEdges: SpineTraversalResult) =>
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

const deriveChainedOrdinalContinuityPlan = (
  previousSpine: RootListSpines,
  nextSpine: RootListSpines,
): OrdinalContinuityPlan => {
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

          const bothListsAreNumberedList =
            isNumberedList(previousList) && isNumberedList(nextList);

          return bothListsAreNumberedList
            ? depth
            : findDeepestLinkableDepth(depth - 1);
        })();

  const deepestLinkDepth = findDeepestLinkableDepth(commonMaximumDepth);

  const linkedDepths =
    deepestLinkDepth < 0
      ? []
      : Array.from({length: deepestLinkDepth + 1}, (_, index) => index);

  const startsByDepth = new Map<number, number>(
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

        const start = previousLastValueIsValid
          ? requiresIncrementAtThisDepth
            ? previousLastValue + 1
            : previousLastValue
          : // If value is missing or 0, treat it as non-linkable at that depth (defensive).
            0;

        return [currentDepth, start] as const;
      })
      .filter(([, start]) => start > 0),
  );

  // Explicit “continuity applies at these depths” (semantic, not mutation-based)
  const appliedDepths = new Set<number>(linkedDepths);

  return {
    appliedDepths,
    leadingLists: nextSpine.leading.lists,
    linkDepth: deepestLinkDepth,
    linkedDepths,
    startsByDepth,
    trailingLists: nextSpine.trailing.lists,
  };
};

const deriveCascadedOrdinalContinuityPlans = (
  chainedOrdinalContinuityPlans: OrdinalContinuityPlan[],
) => {
  return chainedOrdinalContinuityPlans.reduce<OrdinalContinuityPlan[]>(
    (plans, plan) => {
      const previousPlan = plans.at(-1);

      if (previousPlan) {
        plan.startsByDepth.forEach((start, depth) => {
          const lastStart = previousPlan.startsByDepth.get(depth) ?? NaN;

          // Early return if `lastStart` is `NaN`
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
      }

      plans.push(plan);

      return plans;
    },
    [],
  );
};

type Normalization = () => void;

const computeOrderedListOrdinalContinuityNormalizations = (
  rootNode: RootNode,
): Normalization[] => {
  const allListEdges = traverseAllListEdges(rootNode);

  const adjacentListEdges = pairAdjacentListEdges(allListEdges);

  const chainedOrdinalContinuityPlans = adjacentListEdges.map(
    ([previous, next]) => deriveChainedOrdinalContinuityPlan(previous, next),
  );

  const cascadedOrdinalContinuityPlans = deriveCascadedOrdinalContinuityPlans(
    chainedOrdinalContinuityPlans,
  );

  // Apply (idempotently): only write when mismatched.
  const normalizations = cascadedOrdinalContinuityPlans.reduce<Normalization[]>(
    (allPlanNormalizations, plan) => {
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
 * ordered lists in a Lexical document. It is designed to be idempotent and
 * to run inside a NodeTransform to avoid update waterfalls.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Structural Scope & Assumptions
 *
 * - Only ListNode instances that are direct children of the editor RootNode
 *   are considered as continuity candidates.
 *
 * - Continuity is evaluated only between adjacent root-level lists after
 *   ignoring non-list root nodes (e.g. paragraphs, quotes, tables) that break
 *   continuity.
 *
 * - Lists nested inside all other container blocks, if any, are not treated as
 *   independent continuity blocks.
 *
 * - Document order is defined strictly by `RootNode.getChildren()`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # List Semantics
 *
 * - Only numbered (ordered) lists participate in continuity.
 *   Bullet and checklist types are explicitly excluded.
 *
 * - Continuity is evaluated per nesting depth.
 *   A mismatch at a given depth breaks continuity at that depth and below,
 *   but shallower depths may still link.
 *
 * - Continuity is evaluated as long as there is common depth between
 *   trailing spine of prior root-level list and leading spine of the next
 *
 * - List depth is inferred structurally by walking nested `ListNodes` through
 *   `ListItemNode` children; no depth metadata is stored or assumed.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Spine Model
 *
 * - Each root-level list is modeled via two spines:
 *   – a leading spine (first item → first nested list → …)
 *   – a trailing spine (last item → last nested list → …)
 *
 * - Nested lists are discovered only as direct children of ListItemNode.
 *
 * - If multiple nested lists exist within a list item, the first or last
 *   nested list is selected depending on traversal edge (leading/trailing).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Ordinal Continuity Rules
 *
 * - Continuity is bounded by the shallowest common depth of the two spines.
 *
 * - Linking always starts at depth 0 and proceeds contiguously downward.
 *
 * - The deepest linkable depth is chosen preferentially; deeper continuity
 *   wins over shallower continuity.
 *
 * - Only the deepest linked depth requires incrementing (+1) the previous
 *   ordinal value. Shallower depths reuse the previous value as-is.
 *
 *   This relies on Lexical semantics where the trailing ListItem value at the
 *   deepest depth represents the last rendered ordinal, while parent depths
 *   already represent the next start value.
 *
 * - Missing, zero, or non-finite ordinal values are treated defensively as
 *   non-linkable at that depth.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Cascading Behavior
 *
 * - Continuity plans cascade forward across multiple adjacent root lists.
 *
 * - Ordinal starts are monotonic per depth and never decrease.
 *
 * - Later plans may inherit or override earlier starts, but no backward
 *   correction is performed.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Transform Semantics
 *
 * - Normalization runs inside a ListNode NodeTransform to ensure all mutations
 *   occur within the same editor update pass.
 *
 * - The normalization logic is idempotent and safe to re-run multiple times
 *   within a single update.
 *
 * - This plugin does not attempt partial-document optimization; it assumes
 *   correctness over minimal recomputation.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * # Explicit Non-Goals
 *
 * - No continuity across non-list root nodes
 * - No support for mixed list types
 * - No repair of malformed list structures
 * - No inference of user intent beyond document structure
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
