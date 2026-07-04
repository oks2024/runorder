import { describe, it, expect } from 'vitest'
import { readFileText } from './download'

const pickerInput = () =>
  document.querySelector<HTMLInputElement>('input[type=file]')

describe('download — readFileText', () => {
  it('resolves null and removes the input when the picker is cancelled', async () => {
    const promise = readFileText()
    const input = pickerInput()
    expect(input).toBeTruthy()
    input!.dispatchEvent(new Event('cancel'))
    await expect(promise).resolves.toBeNull()
    expect(pickerInput()).toBeNull()
  })

  it('resolves the file text and removes the input on selection', async () => {
    const promise = readFileText()
    const input = pickerInput()!
    Object.defineProperty(input, 'files', {
      value: [new File(['{"hi":1}'], 'x.json')],
    })
    input.dispatchEvent(new Event('change'))
    await expect(promise).resolves.toBe('{"hi":1}')
    expect(pickerInput()).toBeNull()
  })
})
