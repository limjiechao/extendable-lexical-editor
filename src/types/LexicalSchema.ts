/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type {SerializedAutocompleteNode} from '../../src/nodes/AutocompleteNode';
import type {SerializedEquationNode} from '../../src/nodes/EquationNode';
import type {SerializedFootnoteNode} from '../../src/nodes/FootnoteNode';
import type {SerializedImageNode} from '../../src/nodes/ImageNode';
import type {SerializedLayoutContainerNode} from '../../src/nodes/LayoutContainerNode';
import type {SerializedLayoutItemNode} from '../../src/nodes/LayoutItemNode';
import type {SerializedPageBreakNode} from '../../src/nodes/PageBreakNode';
import type {CodeHighlightNode, SerializedCodeNode} from '@lexical/code';
import type {SerializedDocument as SerializedDocument$1} from '@lexical/file';
import type {SerializedAutoLinkNode, SerializedLinkNode} from '@lexical/link';
import type {SerializedListItemNode, SerializedListNode} from '@lexical/list';
import type {SerializedMarkNode} from '@lexical/mark';
import type {SerializedOverflowNode} from '@lexical/overflow';
import type {SerializedHorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import type {
  SerializedHeadingNode,
  SerializedQuoteNode,
} from '@lexical/rich-text';
import type {
  SerializedTableCellNode,
  SerializedTableNode,
  SerializedTableRowNode,
} from '@lexical/table';
import type {
  SerializedEditorState as SerializedEditorState$1,
  SerializedElementNode,
  SerializedLexicalNode,
  SerializedTextNode,
} from 'lexical';

export type SerializedNodeVersion = 1;

type SerializedCodeHighlightNode = Parameters<
  (typeof CodeHighlightNode)['importJSON']
>[0];

type SerializedSpecialTextNode = SerializedTextNode;

export type {
  // Based on "/src/nodes/PlaygroundNodes.ts"
  SerializedAutocompleteNode,
  SerializedAutoLinkNode,
  SerializedCodeHighlightNode,
  SerializedCodeNode,
  SerializedEquationNode,
  SerializedFootnoteNode,
  SerializedHeadingNode,
  SerializedHorizontalRuleNode,
  SerializedImageNode,
  SerializedLayoutContainerNode,
  SerializedLayoutItemNode,
  SerializedLinkNode,
  SerializedListItemNode,
  SerializedListNode,
  SerializedMarkNode,
  SerializedOverflowNode,
  SerializedPageBreakNode,
  SerializedQuoteNode,
  SerializedSpecialTextNode,
  SerializedTableCellNode,
  SerializedTableNode,
  SerializedTableRowNode,
};

type SerializedEditorNode =
  | SerializedAutocompleteNode
  | SerializedAutoLinkNode
  | SerializedCodeHighlightNode
  | SerializedCodeNode
  | SerializedEquationNode
  | SerializedFootnoteNode
  | SerializedHeadingNode
  | SerializedHorizontalRuleNode
  | SerializedImageNode
  | SerializedLayoutContainerNode
  | SerializedLayoutItemNode
  | SerializedLinkNode
  | SerializedListItemNode
  | SerializedListNode
  | SerializedMarkNode
  | SerializedOverflowNode
  | SerializedPageBreakNode
  | SerializedQuoteNode
  | SerializedSpecialTextNode
  | SerializedTableCellNode
  | SerializedTableNode
  | SerializedTableRowNode;

type SerializedEditorState = SerializedEditorState$1<SerializedEditorNode>;

interface SerializedDocument extends SerializedDocument$1 {
  editorState: SerializedEditorState;
  lastSaved: number;
  source: string;
  version: string;
}

export type {
  SerializedDocument,
  SerializedEditorNode,
  SerializedEditorState,
  SerializedElementNode,
  SerializedLexicalNode,
};
