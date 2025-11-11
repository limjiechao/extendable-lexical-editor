/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {NodeContextMenuOption as NodeContextMenuOptionType} from '@lexical/react/LexicalNodeContextMenuPlugin';

import {
  editorStateFromSerializedDocument,
  type SerializedDocument,
  serializedDocumentFromEditorState,
} from '@lexical/file';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {
  defineExtension,
  type EditorThemeClasses,
  type Klass,
  type LexicalNode,
} from 'lexical';
import {type JSX, type ReactNode, useEffect, useMemo} from 'react';

import {DEFAULT_SETTINGS, type Settings} from '../appSettings';
import {buildHTMLConfig} from '../buildHTMLConfig';
import {SharedHistoryContext} from '../context/SharedHistoryContext';
import {ToolbarContext} from '../context/ToolbarContext';
import Editor from '../Editor';
import {TableContext} from '../plugins/TablePlugin';

type FeatureConfig = Partial<Settings>;

export type ToolbarButton = ReactNode;
export type InsertMenuItem = ReactNode;
export type NodeContextMenuOption = NodeContextMenuOptionType;

export type ExtendableEditorProps = {
  collabDocId: string;
  name: string;
  namespace: string;
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
  theme?: EditorThemeClasses;
  features?: FeatureConfig;
  initialDocument?: SerializedDocument;
  onChangeDocument?: (doc: SerializedDocument) => void;
  onSaveDocument?: (doc: SerializedDocument) => void;
  toolbarButtons?: ToolbarButton[];
  insertMenuItems?: InsertMenuItem[];
  contextMenuItems?: NodeContextMenuOption[];
};

export default function ExtendableEditor({
  collabDocId,
  name,
  namespace,
  nodes,
  theme,
  features,
  initialDocument,
  onChangeDocument,
  onSaveDocument,
  toolbarButtons,
  insertMenuItems,
  contextMenuItems,
}: ExtendableEditorProps): JSX.Element {
  const extension = useMemo(
    () =>
      defineExtension({
        $initialEditorState:
          initialDocument != null
            ? (editor) => {
                editor.setEditorState(
                  editorStateFromSerializedDocument(editor, initialDocument),
                );
              }
            : undefined,
        html: buildHTMLConfig(),
        name,
        namespace,
        nodes,
        theme,
      }),
    [initialDocument, name, namespace, nodes, theme],
  );

  const mergedFeatures: Settings = {
    ...DEFAULT_SETTINGS,
    ...(features ?? {}),
  };

  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <SharedHistoryContext>
        <TableContext>
          <ToolbarContext>
            <div className="editor-shell">
              <Editor
                config={mergedFeatures}
                collabDocId={collabDocId}
                toolbarButtons={toolbarButtons}
                insertMenuItems={insertMenuItems}
                contextMenuItems={contextMenuItems}
              />
              {onChangeDocument ? (
                <OnChangePlugin
                  onChange={(editorState, _editor) => {
                    onChangeDocument(
                      serializedDocumentFromEditorState(editorState, {
                        source: namespace,
                      }),
                    );
                  }}
                />
              ) : null}
              {onSaveDocument ? (
                <SaveOnShortcutPlugin
                  onSaveDocument={onSaveDocument}
                  source={namespace}
                />
              ) : null}
            </div>
          </ToolbarContext>
        </TableContext>
      </SharedHistoryContext>
    </LexicalExtensionComposer>
  );
}

function SaveOnShortcutPlugin({
  onSaveDocument,
  source,
}: {
  onSaveDocument: (document: SerializedDocument) => void;
  source: string;
}): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isSave =
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === 's' || event.code === 'KeyS');
      if (isSave) {
        event.preventDefault();
        const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
          source,
        });
        onSaveDocument(doc);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor, onSaveDocument, source]);
  return null;
}
