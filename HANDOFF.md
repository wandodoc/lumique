# Lumique 인수인계 (2026-11-23)

다른 에이전트(코덱스 등)가 이 저장소 작업을 이어받을 때 먼저 읽는 문서.
모든 변경은 `main`에 커밋돼 있고, Vercel이 `main` 푸시를 자동 배포한다 (lumique-beta.vercel.app).

## 프로젝트 개요
- React 19 + Vite SPA. 동아리(밴드) 공연 예매·뒤풀이·정산 관리 앱.
- 데이터는 **Firestore 단일 문서** `club_ledger/main_state` (1MiB 제한 주의) + 보조 문서(`settings`, `receipt_<지출id>`, 등).
- 상태 저장은 `src/context/AppContext.jsx`의 **diff 기반 동기화**(`computeMainStateDiff` → `firebaseStorage.applyMainStateDiff`)만 사용. 전체 상태 통째 저장 금지 (과거 데이터 유실 사고 2회의 원인).
- Firestore 보안 규칙이 롤백성 쓰기(오래된 lastUpdated, 4건 이상 삭제)를 서버에서 차단한다. `firestore.rules` 참고.

## 사용자(관리자) 작업 규칙 — 반드시 지킬 것
1. **작업 단위마다 즉시 commit + push** (모아서 하지 않음). 커밋 메시지는 영어, 끝에 에이전트 서명.
2. **localStorage를 데이터 저장소로 쓰지 않는다.** Firestore만. (UI 편의 상태 저장 정도만 예외)
3. **사용자 노출 문구(카피) 변경은 후보 2~4개를 먼저 제시**하고 선택받은 뒤 적용. 버그/동작 수정은 바로 적용.
4. **큰 UI 개편은 적용 전에 목업(HTML 미리보기)을 먼저 제시.** 바로 고칠 수 있는 건 바로 고치고 알려주기.
5. 프로덕션 Firestore에 임의 쓰기 금지 (읽기/스냅샷은 가능). 복구 스크립트는 `.omc/` 참고.
6. 사용자에게는 한국어로 답한다. 사용자는 비개발자.

## 핵심 파일
- `src/pages/ReservationManagementPage.jsx` (~4100줄) — 티켓 관리 페이지 전체: 예매 내역 표(+모바일 카드), 공연 정산 호출, 뒤풀이 관리. 대부분의 작업이 여기서 일어난다.
- `src/components/ShowSettlementCard.jsx` — 공연 정산표 (수입/지출/회비 부담/증빙 첨부, `receipt_<id>` 문서 사용).
- `src/pages/TicketOrderForm.jsx` — 공개 예매 폼 (`/form/:showId`). 뒤풀이 정원 잔여 계산 있음.
- `src/utils/firebaseStorage.js` — 모든 Firestore 접근. `patchShow`/`patchOrders`(트랜잭션), `appendOrderWithInventory`(매진·뒤풀이 정원 서버 검증).
- `src/pages/PageStyles.css` — 뒤풀이/모바일 반응형 CSS.

## 뒤풀이 데이터 모델 (최신, 2026-11-23 기준)
- **팀 = 그룹 (1:1)**. 좌석 배치의 팀은 그룹 탭…이 아니라 이제 "신청자 명단" 탭과 같은 분류 데이터에서 파생된다. 분류 원천:
  - 예매(order): `inviterMemberId`(공연자 id | 'unassigned' = 명시적 없음) / `inviterGroupLabel`(텍스트 그룹) / 자동 이름 매칭. `classifyAfterPartyOrder` 참고.
  - 공연자: `show.afterPartyPerformerIds`(참석), `show.performerGroupMapping[memberId] = '그룹명' | 'member:<호스트id>'`, `show.afterPartyPerformerOrderIds[memberId] = orderId`(본인 예매 연결, 인원 중복 제거).
- 팀 카드 파생: `afterPartyGroupsList` 메모 (id = `member:<id>` | `group:<라벨>`).
- **테이블 레코드**(`show.tables[]`)는 이제 팀 메타데이터만 저장: `{ id, groupKey, name, capacity(미사용·과거), gridRow, gridCol, repIds[](테이블 대표 셀 키), seatOrder[](자리 배열, null=비워둔 자리) }`. 과거 배치도 좌표/seats 필드는 데이터만 보존하고 UI에서 안 쓴다.
- **좌석 슬롯**: `seatOrder`가 위치 배열(값 = 셀 키 `p:<memberId>` / `a:<orderId>:<n>` / null). 팀 정원 = 기본 정원(`show.afterPartyTableSize`) × 필요한 테이블 수(자동). 기본 정원 단위로 "테이블 1/2/3" 박스로 렌더링.
- 기타 show 필드: `afterPartyLimit`(뒤풀이 정원), `afterPartyVenueName`, `afterPartyTableSize`, `afterPartyTableInventory[{size,count}]`, `seatingGrid{rows,cols}`.
- 뒤풀이 정원 집계는 **관리 페이지·예매 폼·서버 검증 모두 "본인 예매 연결 중복 제거" 방식**으로 통일돼 있다. 바꿀 때 세 곳(RMP, TicketOrderForm, firebaseStorage)을 같이 봐야 함.

## UI 현황 (뒤풀이 관리)
- 탭 2개: ① 신청자 명단(정리함 + 읽기전용 명단) ② 좌석 배치.
- 좌석 배치: 공연자 참석 패널(본인 예매 연결 포함) + 미배치 풀 + 가게 격자(N×M, 팀 머리글 드래그로 배치) + 팀 카드(테이블 박스/셀).
- 셀 상호작용: 이름 클릭=정보 팝오버(초대자 원문 등 + "다른 팀으로 이동" 선택), ☆=테이블 대표(주황 하이라이트), ✕=빼기, 드래그=같은 팀 자리 교체·이동/다른 팀 이동, 빈 칸 탭=자동완성(미배치/같은 팀 자리 이동/다른 팀에서 이동).
- 모바일(≤700px): 팀 1열, 예매 표 → 카드 목록, 섹션 접기(예매/정산/뒤풀이), 드래그 대신 탭 이동.

## 빌드·검증·커밋 루프
```bash
npm run build 2>&1 | grep -E "built in|error"
npm run lint 2>&1 | grep <파일명> | grep -v exhaustive-deps
# 브라우저 스모크 테스트 (비관리자 화면만 가능):
npm run dev -- --port 5199 &  # 이후 .omc/shots/cdp-shot.cjs 로 헤드리스 엣지 스크린샷
node .omc/shots/cdp-shot.cjs <임시프로필dir> http://localhost:5199/manage/<showId> out.png 15000
# 환경변수: VIEW_W/VIEW_H(뷰포트), PRE_EVAL/EVAL/EVAL2(JS 실행), CLIP_SEL(요소 클립)
git add <files> && git commit -m "..." && git push origin main
```
- 관리자 전용 동작은 헤드리스로 클릭 테스트 불가 → 사용자에게 "직접 확인해 달라"고 알릴 것.
- 거대 파일 수정은 Edit 대신 **파이썬 치환 스크립트(개수 검증 rep())** 패턴 권장. 범위 삭제(cut) 시 앵커 사이에 필요한 코드가 없는지 반드시 확인 (과거 두 번 과잉 삭제 사고 있었음).

## 주의사항 / 미해결
- `.env`, `.env.production`은 미추적 — 절대 커밋 금지.
- `.omc/backups/`에 사고 스냅샷·복구 스크립트 보존 — 지우지 말 것.
- 혼합 테이블 크기(한 팀에 4인석+6인석)는 미지원: 테이블 박스는 기본 정원 단위 고정. 보유 테이블(4인×10 등)은 집계용.
- 객원(게스트) 공연자 참가비 정산 정책은 사용자가 보류 중 (현행: 그대로 계산).
- 뒤풀이 날짜의 PITR·예매 문의 연락처(settings.reservationContact)는 사용자가 직접 관리.
