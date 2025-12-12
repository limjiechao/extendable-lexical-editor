/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import {$isListNode, ListNode} from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
  SKIP_SELECTION_FOCUS_TAG,
} from 'lexical';
import {type JSX, useEffect, useMemo, useState} from 'react';

import Button from '../../ui/Button';
import {DialogActions} from '../../ui/Dialog';
import TextInput from '../../ui/TextInput';

export const START_NEW_ORDERED_LIST: LexicalCommand<undefined> =
  createCommand();
export const CONTINUE_ORDERED_LIST: LexicalCommand<undefined> = createCommand();
export const SET_ORDERED_LIST_START: LexicalCommand<number> = createCommand();

export default function OrderedListManualRenumberingPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        START_NEW_ORDERED_LIST,
        () => {
          editor.update(() => {
            $addUpdateTag(SKIP_SELECTION_FOCUS_TAG);
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }
            const anchorNode = selection.anchor.getNode();
            const list = anchorNode.getParents().find((n) => $isListNode(n));
            if ($isListNode(list) && list.getListType() === 'number') {
              list.setStart(1);
            }
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        CONTINUE_ORDERED_LIST,
        () => {
          editor.update(() => {
            $addUpdateTag(SKIP_SELECTION_FOCUS_TAG);
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }
            const anchorNode = selection.anchor.getNode();
            const currentList = anchorNode
              .getParents()
              .find((n) => $isListNode(n)) as ListNode | undefined;
            if (
              !$isListNode(currentList) ||
              currentList.getListType() !== 'number'
            ) {
              return;
            }
            let previous: ListNode | null =
              (currentList.getPreviousSibling() as ListNode | null) ?? null;
            while (previous) {
              if (
                $isListNode(previous) &&
                previous.getListType() === 'number'
              ) {
                const prevStart = previous.getStart() ?? 1;
                const prevCount = previous.getChildren().length;
                const nextStart = Math.max(
                  1,
                  prevStart + Math.max(0, prevCount),
                );
                currentList.setStart(nextStart);
                return;
              }
              previous = previous.getPreviousSibling() as ListNode | null;
            }
            currentList.setStart(1);
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<number>(
        SET_ORDERED_LIST_START,
        (payload) => {
          const startValue = Math.max(1, Math.floor(payload ?? 1));
          editor.update(() => {
            $addUpdateTag(SKIP_SELECTION_FOCUS_TAG);
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }
            const anchorNode = selection.anchor.getNode();
            const list = anchorNode.getParents().find((n) => $isListNode(n));
            if ($isListNode(list) && list.getListType() === 'number') {
              list.setStart(startValue);
            }
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor]);

  return null;
}

export function NumberedListDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const [value, setValue] = useState('1');
  const isValid = useMemo(() => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1;
  }, [value]);

  const onConfirm = () => {
    const n = Math.max(1, Math.floor(Number(value) || 1));
    activeEditor.dispatchCommand(SET_ORDERED_LIST_START, n);
    onClose();
  };

  return (
    <>
      <TextInput
        label="Start value"
        value={value}
        onChange={setValue}
        placeholder="Enter a positive integer"
        type="number"
        data-test-id="numbered-list-start-input"
      />
      <DialogActions data-test-id="numbered-list-confirm">
        <Button disabled={!isValid} onClick={onConfirm}>
          Confirm
        </Button>
      </DialogActions>
    </>
  );
}
