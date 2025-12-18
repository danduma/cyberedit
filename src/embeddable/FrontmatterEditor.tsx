import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Code, Table as TableIcon } from 'lucide-react'

interface FrontmatterEditorProps {
  rawYaml: string
  onChange: (newYaml: string) => void
}

interface KeyValuePair {
  id: string
  key: string
  value: string
}

export const FrontmatterEditor: React.FC<FrontmatterEditorProps> = ({ rawYaml, onChange }) => {
  const [mode, setMode] = useState<'table' | 'raw'>('table')
  const [pairs, setPairs] = useState<KeyValuePair[]>([])
  
  // Parse YAML when entering table mode or on init
  useEffect(() => {
    if (mode === 'table') {
        try {
            const lines = rawYaml.split('\n')
            const newPairs: KeyValuePair[] = []
            
            lines.forEach((line, index) => {
                const trimmed = line.trim()
                if (!trimmed) return
                if (trimmed.startsWith('#')) return // Skip comments for now in table view
                
                const colonIndex = line.indexOf(':')
                if (colonIndex !== -1) {
                    newPairs.push({
                        id: `row-${index}-${Date.now()}`,
                        key: line.substring(0, colonIndex).trim(),
                        value: line.substring(colonIndex + 1).trim()
                    })
                }
            })
            setPairs(newPairs)
        } catch (e) {
            console.error("Failed to parse YAML for table view", e)
            setMode('raw')
        }
    }
  }, [mode, rawYaml]) // Careful with rawYaml dependency if we edit it

  // We need to manage local state for pairs to avoid jitter, but also sync with rawYaml?
  // Actually, we should only update rawYaml when pairs change.
  // And if rawYaml changes from outside (undo/redo), we need to update pairs.
  // But updating pairs triggers onChange, which updates rawYaml... loop?
  // We can use a ref or check for equality.
  
  // Let's rely on internal state 'pairs' while in table mode, and push to parent.
  // And if parent updates rawYaml (e.g. undo), we need to reflect that.
  
  // To avoid loops: Only update pairs from rawYaml if rawYaml differs from what we expect based on current pairs?
  // Or just parse rawYaml on mount and when it changes externally?
  // Implementing a robust 2-way binding for parsed content is tricky.
  // Let's keep it simple: We parse rawYaml into pairs on mount.
  // When pairs change, we serialize and call onChange.
  
  const serializePairs = (currentPairs: KeyValuePair[]) => {
      return currentPairs.map(p => `${p.key}: ${p.value}`).join('\n')
  }

  const handlePairChange = (index: number, field: 'key' | 'value', newValue: string) => {
      const newPairs = [...pairs]
      newPairs[index] = { ...newPairs[index], [field]: newValue }
      setPairs(newPairs)
      onChange(serializePairs(newPairs))
  }

  const addPair = () => {
      const newPairs = [...pairs, { id: `new-${Date.now()}`, key: '', value: '' }]
      setPairs(newPairs)
      onChange(serializePairs(newPairs))
  }

  const removePair = (index: number) => {
      const newPairs = pairs.filter((_, i) => i !== index)
      setPairs(newPairs)
      onChange(serializePairs(newPairs))
  }

  if (mode === 'raw') {
      return (
          <div className="border rounded-md p-2 bg-muted/30 my-2">
              <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metadata (YAML)</span>
                  <Button variant="ghost" size="sm" onClick={() => setMode('table')}>
                      <TableIcon className="h-4 w-4 mr-1" /> Table View
                  </Button>
              </div>
              <textarea 
                  className="w-full min-h-[100px] p-2 text-sm font-mono border rounded bg-background"
                  value={rawYaml}
                  onChange={(e) => onChange(e.target.value)}
              />
          </div>
      )
  }

  return (
    <div className="border rounded-md p-2 bg-muted/30 my-2 select-none">
        <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metadata</span>
            <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setMode('raw')}>
                    <Code className="h-4 w-4 mr-1" /> Raw YAML
                </Button>
            </div>
        </div>
        <div className="bg-background rounded-md border overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[200px]">Key</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pairs.map((pair, index) => (
                        <TableRow key={pair.id}>
                            <TableCell className="p-2">
                                <Input 
                                    value={pair.key} 
                                    onChange={(e) => handlePairChange(index, 'key', e.target.value)}
                                    className="h-8"
                                    placeholder="Key"
                                />
                            </TableCell>
                            <TableCell className="p-2">
                                <Input 
                                    value={pair.value} 
                                    onChange={(e) => handlePairChange(index, 'value', e.target.value)}
                                    className="h-8"
                                    placeholder="Value"
                                />
                            </TableCell>
                            <TableCell className="p-2">
                                <Button variant="ghost" size="sm" onClick={() => removePair(index)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                    {pairs.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                No metadata properties
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <div className="p-2 bg-muted/10 border-t">
                <Button variant="outline" size="sm" onClick={addPair} className="w-full">
                    <Plus className="h-4 w-4 mr-2" /> Add Property
                </Button>
            </div>
        </div>
    </div>
  )
}


