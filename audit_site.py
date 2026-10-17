#!/usr/bin/env python3
"""Contrôles déterministes du site statique: pages, liens, métadonnées, sitemaps, réponses."""
from pathlib import Path
from urllib.parse import urlsplit
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
import sys
ROOT=Path(__file__).resolve().parent/'dist'
class Doc(HTMLParser):
 def __init__(self):
  super().__init__();self.links=[];self.meta=[];self.tag_count={};self.title='';self.h1=[];self.canonical=[];self.jsonld=[];self._cur='';self._capture=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs);self.tag_count[tag]=self.tag_count.get(tag,0)+1
  if tag=='a' and 'href' in d:self.links.append(d['href'])
  if tag=='link' and d.get('rel')=='canonical':self.canonical.append(d.get('href',''))
  if tag=='meta':self.meta.append(d)
  if tag=='script' and d.get('type')=='application/ld+json':self._capture.append('script')
  if tag in ('h1','title'):self._capture.append(tag)
 def handle_endtag(self,tag):
  if self._capture and self._capture[-1]==tag:self._capture.pop()
 def handle_data(self,data):
  if self._capture:
   if self._capture[-1]=='title':self.title+=data
   if self._capture[-1]=='h1':self.h1.append(data)
   if self._capture[-1]=='script':self.jsonld.append(data)

def audit():
 errs=[];warn=[];pages=list(ROOT.rglob('index.html'));sitemap=ET.parse(ROOT/'sitemap.xml');ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'};locs=[e.text for e in sitemap.findall('s:url/s:loc',ns)]
 if len(locs)!=len(pages):errs.append(f'Sitemap {len(locs)} URLs contre {len(pages)} pages')
 if len(set(locs))!=len(locs):errs.append('URLs dupliquées dans sitemap')
 titles=set();descs=set()
 for f in pages:
  doc=Doc();doc.feed(f.read_text(encoding='utf-8'))
  path='/' if f==ROOT/'index.html' else '/'+f.parent.name+'/'
  if doc.tag_count.get('h1',0)!=1:errs.append(f'{path}: H1 != 1')
  if not doc.title.strip() or doc.title in titles:errs.append(f'{path}: Title absent / dupliqué')
  titles.add(doc.title)
  desc=next((m.get('content','') for m in doc.meta if m.get('name')=='description'),None)
  if not desc or desc in descs:errs.append(f'{path}: description absente / dupliquée')
  descs.add(desc)
  if len(doc.canonical)!=1:errs.append(f'{path}: canonical absent / multiple')
  if not doc.jsonld:errs.append(f'{path}: JSON-LD absent')
  if path!='/':
   if doc.tag_count.get('details',0)<3:errs.append(f'{path}: moins de 3 questions')
   if doc.tag_count.get('section',0)<5:errs.append(f'{path}: sections insuffisantes')
  for link in doc.links:
   if not link.startswith('/') or link.startswith('//'):continue
   local=urlsplit(link).path
   t=ROOT/local.lstrip('/')
   if local.endswith('/'):t=t/'index.html'
   if not t.is_file():errs.append(f'{path}: lien brisé: {link}')
  if not any(x.endswith(path) for x in locs):errs.append(f'{path}: absent du sitemap')
 if not (ROOT/'style.css').is_file():errs.append('CSS absent')
 if not (ROOT/'robots.txt').is_file():errs.append('robots absent')
 print('AUDIT_SITE', 'PASS' if not errs else 'FAIL', f'{len(pages)} pages',f'{len(locs)} URLs sitemap',f'{len(titles)} titres uniques',f'{len(errs)} erreurs')
 for e in errs:print('FAIL',e)
 return 1 if errs else 0
if __name__=='__main__':sys.exit(audit())